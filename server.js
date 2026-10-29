import express from "express";
import ExcelJS from "exceljs";
import yauzl from "yauzl";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { analyze, protectedPayload, InputError } from "./employment-analysis.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const ttl = 20 * 60 * 1000;
const token = () => randomBytes(24).toString("hex");
const maxRows = 20000;

function checkArchive(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(new InputError("올바른 XLSX 파일이 아닙니다."));
      let size = 0, entries = 0, finished = false;
      const fail = () => {
        if (finished) return;
        finished = true; zip.close(); reject(new InputError("엑셀 압축 해제 크기/항목 한도를 초과했거나 손상된 파일입니다."));
      };
      zip.on("error", fail);
      zip.on("entry", entry => {
        size += entry.uncompressedSize; entries++;
        if (size > 40 * 1024 * 1024 || entries > 1500) return fail();
        zip.readEntry();
      });
      zip.on("end", () => { if (!finished) { finished = true; resolve(); } });
      zip.readEntry();
    });
  });
}

function cellText(cell) {
  if (cell.type === ExcelJS.ValueType.Formula) throw new InputError("수식 셀은 지원하지 않습니다. 값을 붙여넣은 사본을 업로드하세요.");
  if (cell.type === ExcelJS.ValueType.Error) throw new InputError("엑셀 오류 셀을 정정하세요.");
  const value = cell.text.trim();
  if (value.length > 1000) throw new InputError("셀 내용은 최대 1,000자입니다. 분석에 필요한 열만 남긴 사본을 사용하세요.");
  return value;
}

export async function readWorkbook(buffer) {
  if (buffer.length > 8 * 1024 * 1024) throw new InputError("파일당 최대 8MB입니다.");
  await checkArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new InputError("엑셀을 읽지 못했습니다. 암호 없는 XLSX 파일인지 확인하세요."); }
  if (workbook.worksheets.length > 20) throw new InputError("시트는 최대 20개입니다.");
  let totalRows = 0;
  const sheets = workbook.worksheets.filter(s => s.rowCount).map(sheet => {
    if (sheet.rowCount > maxRows + 1 || sheet.columnCount > 80) throw new InputError("시트당 최대 20,000행·80열입니다.");
    const header = sheet.getRow(1);
    const headers = Array.from({ length: sheet.columnCount }, (_, i) => cellText(header.getCell(i + 1)) || `열 ${i + 1}`);
    const rows = [];
    sheet.eachRow((row, i) => {
      if (i === 1) return;
      const cells = headers.map((_, j) => cellText(row.getCell(j + 1)));
      if (cells.some(Boolean)) rows.push(cells);
    });
    totalRows += rows.length;
    if (totalRows > maxRows) throw new InputError("파일 전체 데이터는 최대 20,000행입니다.");
    return { name: sheet.name, headers, rows };
  });
  if (!sheets.length) throw new InputError("데이터 시트가 없습니다. 첫 행을 열 제목으로 구성하세요.");
  return sheets;
}

export function createApp({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || "gemini-2.5-flash", fetchImpl = fetch } = {}) {
  const app = express(), workbooks = new Map(), analyses = new Map();
  const retain = (map, id, item) => {
    map.set(id, item);
    setTimeout(() => map.delete(id), ttl).unref();
  };
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.get("host") || "";
    const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+$/.test(host);
    const isRenderHost = /(?:^|\.)onrender\.com$/.test(host) || /(?:^|\.)render\.com$/.test(host);
    if (!isLocalHost && !isRenderHost) return res.status(403).json({ error: "허용된 호스트에서만 접근할 수 있습니다." });

    const origin = req.get("origin") || "";
    const sameOriginAllowed = !origin || origin === `http://${host}` || origin === `https://${host}` || (isRenderHost && /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:onrender\.com|render\.com)$/i.test(origin));
    if (req.method !== "GET" && !sameOriginAllowed) return res.status(403).json({ error: "동일 출처 요청만 허용합니다." });

    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    const cookie = req.get("cookie")?.match(/(?:^|; )nursingSession=([a-f0-9]{48})(?:;|$)/)?.[1];
    req.sessionId = cookie || token();
    if (!cookie) res.cookie("nursingSession", req.sessionId, { httpOnly: true, sameSite: "strict", maxAge: ttl });
    for (const map of [workbooks, analyses]) for (const [id, value] of map) if (value.expires < Date.now()) map.delete(id);
    next();
  });
  app.use(express.static(root, { index: false, redirect: false, extensions: ["html"] }));
  app.use(express.json({ limit: "12mb" }));
  const owned = (map, id, req) => {
    const item = map.get(id);
    if (!item || item.owner !== req.sessionId) throw new InputError("분석 자료가 만료되었거나 접근할 수 없습니다. 다시 업로드하세요.");
    return item;
  };
  app.get("/", (req, res) => res.sendFile("index.html", { root }));
  app.get("/index.html", (req, res) => res.sendFile("index.html", { root }));
  app.get("/api/status", (req, res) => res.json({ configured: Boolean(apiKey), model, expiresMinutes: 20 }));
  app.post("/api/workbooks", async (req, res) => {
    if (workbooks.size >= 6) throw new InputError("서버의 파일 한도(6개)에 도달했습니다. 분석 자료 삭제 후 다시 업로드하세요.");
    if (typeof req.body?.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(req.body.data)) throw new InputError("파일 데이터가 올바르지 않습니다.");
    const sheets = await readWorkbook(Buffer.from(req.body.data, "base64")), id = token();
    retain(workbooks, id, { owner: req.sessionId, sheets, expires: Date.now() + ttl });
    res.json({ id, sheets: sheets.map((s, i) => ({ index: i, name: s.name, headers: s.headers, rows: s.rows.length })) });
  });
  app.post("/api/values", (req, res) => {
    const item = owned(workbooks, req.body?.id, req);
    const sheet = item.sheets[req.body.sheet];
    const col = Number(req.body.column);
    if (!sheet || !Number.isInteger(col) || col < 0 || col >= sheet.headers.length) throw new InputError("시트와 열을 확인하세요.");
    if (!["course", "status"].includes(req.body.purpose)) throw new InputError("열 용도를 지정하세요.");
    const list = [...new Set(sheet.rows.map(r => r[col]).filter(Boolean))];
    if (list.length > 80) throw new InputError("고유값이 80개를 넘습니다. 학번·이름 열이 아닌 과정/상태 열을 선택하세요.");
    res.json({ values: list });
  });
  app.post("/api/analyze", (req, res) => {
    const body = req.body;
    const a = owned(workbooks, body?.enrollmentToken, req), b = owned(workbooks, body?.employmentToken, req);
    const e = a.sheets[body.enrollmentSheet], j = b.sheets[body.employmentSheet];
    if (!e || !j) throw new InputError("분석할 시트를 선택하세요.");
    const result = analyze(e, j, body.config || {});
    if (analyses.size >= 10) throw new InputError("분석 결과 한도입니다. 자료 삭제 후 다시 분석하세요.");
    const id = token(), payload = protectedPayload(result);
    retain(analyses, id, { owner: req.sessionId, payload, expires: Date.now() + ttl, busy: false, lastCall: 0 });
    res.json({ id, result, payload });
  });
  app.post("/api/interpret", async (req, res) => {
    const item = owned(analyses, req.body?.id, req);
    if (req.body.consent !== true) throw new InputError("전송 집계 검토 및 기관 승인 확인이 필요합니다.");
    if (!apiKey) return res.status(503).json({ error: "서버의 GEMINI_API_KEY가 설정되지 않았습니다. 집계 결과는 로컬에서 확인할 수 있습니다." });
    if (!item.payload.overall.length || !item.payload.comparison.length) throw new InputError("소수 집계 보호 후 비교 가능한 자료가 없습니다. AI로 전송하지 않습니다.");
    if (item.busy || Date.now() - item.lastCall < 30000) return res.status(429).json({ error: "AI 요청 처리 중이거나 재요청 대기 중입니다. 30초 후 다시 시도하세요." });
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("GEMINI_MODEL 설정이 올바르지 않습니다.");
    item.busy = true; item.lastCall = Date.now();
    try {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "당신은 간호교육 성과 분석 보조자입니다. 제공된 비식별 집계만 근거로 한국어 보고서를 작성하세요. 숫자를 새로 만들지 마세요. 요약, 이수/기록없음 비교와 %p 차이, 자료 한계, 개선 제안, 추가 검증 항목을 구분하세요. 기록없음은 미이수 확정이 아닙니다. 인과관계, 유의성, 개인 취업 예측, 누락된 조합/코호트 분석을 주장하지 마세요. 표본·교란·누락 한계를 명시하세요. HTML 대신 일반 텍스트로 답하세요." }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(item.payload) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
        })
      });
      if (!response.ok) return res.status(502).json({ error: `Gemini 요청 실패 (HTTP ${response.status}). 서버 키·모델·할당량을 확인하세요.` });
      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (!candidate || candidate.finishReason !== "STOP") return res.status(502).json({ error: "Gemini가 완전한 답변을 반환하지 않았습니다. 차단·출력 길이·모델 설정을 확인하세요." });
      const answer = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join("\n").trim();
      if (!answer) return res.status(502).json({ error: "Gemini 분석 응답이 비어 있습니다." });
      res.json({ text: answer, model });
    } catch (error) {
      console.error("AI request failed:", error.name);
      res.status(502).json({ error: "Gemini 연결에 실패했거나 시간이 초과되었습니다. 네트워크·서버 설정을 확인하세요." });
    } finally { item.busy = false; }
  });
  app.post("/api/clear", (req, res) => {
    for (const map of [workbooks, analyses]) for (const [id, item] of map) if (item.owner === req.sessionId) map.delete(id);
    res.json({ cleared: true });
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const expected = error instanceof InputError || error.type === "entity.too.large" || error instanceof SyntaxError;
    if (!expected) console.error("Local analysis error:", error.name);
    res.status(expected ? 400 : 500).json({ error: error instanceof InputError ? error.message : expected ? "요청 형식 또는 파일 크기 한도를 확인하세요." : "로컬 분석 처리에 실패했습니다. 파일 형식과 서버 상태를 확인하세요." });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PORT must be 1024..65535");
  createApp().listen(port, "0.0.0.0", () => console.log(`NURSING+ ready: http://0.0.0.0:${port}`));
}

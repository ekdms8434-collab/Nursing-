import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { analyze, protectedPayload } from "./employment-analysis.js";
import { createApp, readWorkbook } from "./server.js";
import { defaultCqiData, sanitizeCqiData } from "./cqi-data.js";

const config = {
  enrollmentId: "0", courseColumn: "1", completionColumn: "2", acceptedValues: "완료", employmentId: "0", outcomeColumn: "1", cohortColumn: "2", fullRoster: true,
  courseMap: { "private-course-name": 3 },
  outcomes: { tertiary: "T", general: "G", other: "O", unemployed: "N", unknown: "U" }
};
function fixture() {
  return {
    enrollment: { headers: ["학번", "과정", "상태"], rows: Array.from({ length: 30 }, (_, i) => [String(i).padStart(6, "0"), "private-course-name", "완료"]) },
    employment: { headers: ["학번", "결과", "졸업"], rows: Array.from({ length: 60 }, (_, i) => [String(i).padStart(6, "0"), ["T", "G", "O", "N", "U"][i % 5], "private-cohort-name"]) }
  };
}
async function workbookBytes(sheet) {
  const w = new ExcelJS.Workbook(), s = w.addWorksheet("자료");
  s.addRow(sheet.headers); s.addRows(sheet.rows);
  return Buffer.from(await w.xlsx.writeBuffer());
}

test("exact text IDs, deduplication, denominators, missing outcomes and match diagnostics", () => {
  const { enrollment, employment } = fixture();
  enrollment.rows.push([...enrollment.rows[0]], ["999999", "private-course-name", "완료"], ["", "private-course-name", "완료"], ["000001", "private-course-name", "신청"]);
  const result = analyze(enrollment, employment, config), total = result.groups[0];
  assert.equal(result.graduates, 60); assert.equal(result.matched, 30);
  assert.equal(result.diagnostics.duplicateEnrollments, 1);
  assert.equal(result.diagnostics.blankEnrollmentIds, 1);
  assert.equal(result.diagnostics.unmatchedEnrollments, 1);
  assert.equal(result.diagnostics.excludedEnrollments, 1);
  assert.deepEqual(total.counts, [12, 12, 12, 12, 12]);
  assert.equal(total.rate, 75);
  const pair = result.groups.filter(g => g.kind === "course" && g.cohort === "전체");
  assert.deepEqual(pair.map(g => g.total), [30, 30]);
  assert.equal(pair[0].rate, 75);
});

test("invalid inputs block analyses rather than fabricated success", () => {
  const { enrollment, employment } = fixture();
  assert.throws(() => analyze(enrollment, employment, { ...config, fullRoster: false }), /전체/);
  assert.throws(() => analyze(enrollment, employment, { ...config, employmentId: "" }), /학번/);
  assert.throws(() => analyze(enrollment, employment, { ...config, courseMap: {} }), /과목군/);
  assert.throws(() => analyze(enrollment, employment, { ...config, outcomes: { ...config.outcomes, other: "T" } }), /중복/);
  employment.rows.push([...employment.rows[0]]);
  assert.throws(() => analyze(enrollment, employment, config), /중복/);
  employment.rows.pop(); employment.rows[0][0] = "";
  assert.throws(() => analyze(enrollment, employment, config), /누락/);
});

test("comparison program CQI data excludes legacy criteria and safety terms", () => {
  const sanitized = sanitizeCqiData({
    standards: [
      { code: "기준 1", name: "비교과 운영계획 및 목표" },
      { code: "기준 3", name: "취약학생 지원" },
      { code: "기준 7", name: "안전관리" },
      { code: "기준 2", name: "학생 참여 및 만족도" }
    ],
    checklist: [
      { label: "취약학생 관리를 점검했는가", note: "가려운 항목", status: "완료" },
      { label: "비교과 프로그램의 목표와 핵심역량 연계가 명확한가", note: "검토", status: "완료" },
      { label: "안전관리 체크리스트를 완료했는가", note: "기본 검토", status: "진행" }
    ],
    actions: [
      { task: "취약학생 지원 프로그램 보완", owner: "지원팀", due: "2027년 1학기", progress: "계획" },
      { task: "프로그램 만족도 환류", owner: "비교과운영위원회", due: "2027년 1학기", progress: "진행" }
    ]
  });

  assert.deepEqual(sanitized.standards.map(item => item.code), ["기준 1", "기준 2"]);
  assert.ok(sanitized.checklist.every(item => !/취약학생|안전관리/.test(item.label)));
  assert.ok(sanitized.actions.every(item => !/취약학생|안전관리/.test(item.task)));
  assert.equal(defaultCqiData().standards.length, 3);
  assert.deepEqual(defaultCqiData().standards.map(item => item.code), ["기준 1", "기준 2", "기준 6"]);
});

test("unmapped status is explicitly counted unknown and leading zeros never guessed", () => {
  const { enrollment, employment } = fixture();
  employment.rows[0][1] = "not-mapped"; enrollment.rows[0][0] = "0";
  const r = analyze(enrollment, employment, config);
  assert.equal(r.diagnostics.unclassified, 1); assert.equal(r.diagnostics.unmatchedEnrollments, 1);
  assert.equal(r.groups[0].unknown, 13);
});

test("external payload contains no IDs/free text/cohorts, and excludes small cells", () => {
  const { enrollment, employment } = fixture();
  const payload = protectedPayload(analyze(enrollment, employment, config));
  assert.equal(payload.overall.length, 1); assert.equal(payload.comparison.length, 2);
  assert.equal(JSON.stringify(payload).includes("private-"), false);
  assert.equal(JSON.stringify(payload).includes("000001"), false);
  enrollment.rows.splice(4);
  const small = protectedPayload(analyze(enrollment, employment, config));
  assert.equal(small.comparison.length, 0);
  assert.equal(small.overall.length, 1);
});

test("XLSX parser retains text identifiers, rejects formulas and invalid files", async () => {
  const { enrollment } = fixture();
  const sheets = await readWorkbook(await workbookBytes(enrollment));
  assert.equal(sheets[0].rows[0][0], "000000");
  const w = new ExcelJS.Workbook(), s = w.addWorksheet("data");
  s.addRow(["ID"]); s.addRow([{ formula: "1+1", result: 2 }]);
  await assert.rejects(readWorkbook(Buffer.from(await w.xlsx.writeBuffer())), /수식/);
  await assert.rejects(readWorkbook(Buffer.from("not xlsx")), /XLSX/);
});

test("local HTTP upload, matching, consent and mocked Gemini roundtrip; no real outbound call", async t => {
  let captured = null;
  const app = createApp({ apiKey: "test-placeholder", fetchImpl: async (url, options) => {
    captured = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "검토용 AI 응답 <script>not executable</script>" }] } }] }), { status: 200 });
  } });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(origin + "/api/status");
  const cookie = initial.headers.get("set-cookie").split(";")[0];
  const post = (path, body, extra = {}) => fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie, ...extra }, body: JSON.stringify(body) });
  assert.equal((await post("/api/clear", {}, { Origin: "https://example.invalid" })).status, 403);
  const { enrollment, employment } = fixture();
  const a = await (await post("/api/workbooks", { data: (await workbookBytes(enrollment)).toString("base64") })).json();
  const b = await (await post("/api/workbooks", { data: (await workbookBytes(employment)).toString("base64") })).json();
  assert.ok(a.id); assert.equal(a.sheets[0].rows, 30);
  const analysis = await (await post("/api/analyze", { enrollmentToken: a.id, employmentToken: b.id, enrollmentSheet: 0, employmentSheet: 0, config })).json();
  assert.equal(analysis.result.matched, 30);
  assert.equal((await post("/api/interpret", { id: analysis.id })).status, 400);
  const answer = await (await post("/api/interpret", { id: analysis.id, consent: true })).json();
  assert.match(answer.text, /검토용/);
  assert.equal(JSON.stringify(captured).includes("private-"), false);
  assert.equal(captured.body.contents[0].parts[0].text, JSON.stringify(analysis.payload));
  assert.equal((await post("/api/interpret", { id: analysis.id, consent: true })).status, 429);
  const denied = await post("/api/values", { id: a.id, sheet: 0, column: 0, purpose: "status" }, { Cookie: "" });
  assert.equal(denied.status, 400);
  assert.equal((await fetch(origin + "/.env")).status, 404);
  await post("/api/clear", {});
  assert.equal((await post("/api/values", { id: a.id, sheet: 0, column: 0, purpose: "status" })).status, 400);
});

test("static CQI data script is served from the local app root", async t => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + "/cqi-data.js");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /sanitizeCqiData|defaultCqiData/);
});

test("missing Gemini key is explicit and never replaced with a simulated interpretation", async t => {
  const server = createApp({ apiKey: "" }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + "/api/status");
  assert.equal((await response.json()).configured, false);
});

test("Gemini credential, upstream, incomplete, empty and network failures are explicit", async t => {
  const { enrollment, employment } = fixture();
  const aData = (await workbookBytes(enrollment)).toString("base64"), bData = (await workbookBytes(employment)).toString("base64");
  const cases = [
    { key: "", fetchImpl: () => { throw new Error("must not call"); }, status: 503, message: /KEY/ },
    { key: "test", fetchImpl: async () => new Response("denied", { status: 403 }), status: 502, message: /HTTP 403/ },
    { key: "test", fetchImpl: async () => new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] })), status: 502, message: /완전한/ },
    { key: "test", fetchImpl: async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [] } }] })), status: 502, message: /비어/ },
    { key: "test", fetchImpl: async () => { throw new TypeError("synthetic network error"); }, status: 502, message: /연결/ }
  ];
  for (const c of cases) {
    const server = createApp({ apiKey: c.key, fetchImpl: c.fetchImpl }).listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const initial = await fetch(origin + "/api/status");
    const cookie = initial.headers.get("set-cookie").split(";")[0];
    const post = (path, body) => fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: JSON.stringify(body) });
    const a = await (await post("/api/workbooks", { data: aData })).json(), b = await (await post("/api/workbooks", { data: bData })).json();
    const analysis = await (await post("/api/analyze", { enrollmentToken: a.id, employmentToken: b.id, enrollmentSheet: 0, employmentSheet: 0, config })).json();
    const response = await post("/api/interpret", { id: analysis.id, consent: true });
    assert.equal(response.status, c.status);
    assert.match((await response.json()).error, c.message);
  }
});

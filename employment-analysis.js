export class InputError extends Error {}

const text = value => String(value ?? "").normalize("NFKC").trim();
const values = value => new Set(String(value ?? "").split(/[,，\n]/).map(text).filter(Boolean));
const sum = list => list.reduce((a, b) => a + b, 0);
const outcomes = ["tertiary", "general", "other", "unemployed", "unknown"];
export const courseLabels = ["투약과정", "감염관리", "근접오류", "KALS", "BLS", "임상 의사소통", "임상 의학용어", "기타 과정"];
export const outcomeLabels = ["상급종합병원", "종합병원", "기타 취업", "미취업", "미확인"];

function column(sheet, index, label, optional = false) {
  if (optional && (index === "" || index === undefined)) return null;
  const n = Number(index);
  if (index === "" || index === undefined || !Number.isInteger(n) || n < 0 || n >= sheet.headers.length) {
    throw new InputError(`${label} 열을 선택하세요.`);
  }
  return n;
}

function stats(records) {
  const counts = outcomes.map(o => records.filter(r => r.outcome === o).length);
  const known = records.length - counts[4], employed = sum(counts.slice(0, 3));
  return { total: records.length, known, unknown: counts[4], employed, counts, rate: known ? employed / known * 100 : null };
}

export function analyze(enrollment, employment, config) {
  const eId = column(enrollment, config.enrollmentId, "명단 학번");
  const eCourse = column(enrollment, config.courseColumn, "과정", true);
  const eStatus = column(enrollment, config.completionColumn, "참석/이수 상태", true);
  if (eStatus === null && config.completedOnly !== true) throw new InputError("상태 열을 선택하거나 이수/참석 확정 명단임을 확인하세요.");
  const accepted = values(config.acceptedValues);
  if (eStatus !== null && !accepted.size) throw new InputError("분석에 포함할 상태값을 입력하세요.");
  const jId = column(employment, config.employmentId, "취업현황 학번");
  const jOutcome = column(employment, config.outcomeColumn, "취업상태");
  const jCohort = column(employment, config.cohortColumn, "졸업 코호트", true);
  if (config.fullRoster !== true) throw new InputError("전체 졸업생 명단 여부를 확인하세요. 취업자만 있는 파일로 취업률을 계산할 수 없습니다.");
  const mapping = config.outcomes;
  if (!mapping || typeof mapping !== "object") throw new InputError("취업상태값 매핑이 필요합니다.");
  const definitions = outcomes.map(o => values(mapping[o]));
  const seenValues = new Set();
  for (const set of definitions) for (const v of set) {
    if (seenValues.has(v)) throw new InputError("한 취업상태값을 여러 유형에 중복 지정할 수 없습니다.");
    seenValues.add(v);
  }
  const students = new Map(), diagnostics = { enrollmentRows: enrollment.rows.length, graduateRows: employment.rows.length, blankEnrollmentIds: 0, blankGraduateIds: 0, duplicateGraduates: 0, duplicateEnrollments: 0, excludedEnrollments: 0, unmatchedEnrollments: 0, unmatchedGraduates: 0, unclassified: 0 };
  for (const row of employment.rows) {
    const id = text(row[jId]);
    if (!id) { diagnostics.blankGraduateIds++; continue; }
    if (students.has(id)) { diagnostics.duplicateGraduates++; continue; }
    const status = text(row[jOutcome]);
    const outcome = outcomes.find((_, i) => definitions[i].has(status));
    if (!outcome) diagnostics.unclassified++;
    students.set(id, { outcome: outcome ?? "unknown", cohort: jCohort === null ? "전체" : text(row[jCohort]) || "미지정", courses: new Set() });
  }
  if (!students.size) throw new InputError("유효한 졸업생 학번이 없습니다.");
  if (diagnostics.duplicateGraduates) throw new InputError(`취업현황 학번 중복 ${diagnostics.duplicateGraduates}건이 있습니다. 학번별 한 행으로 정리한 후 다시 분석하세요.`);
  if (diagnostics.blankGraduateIds) throw new InputError(`취업현황 학번 누락 ${diagnostics.blankGraduateIds}건을 정정하세요.`);
  const courseMap = config.courseMap ?? {};
  const courseNames = new Map(), links = new Set();
  for (const row of enrollment.rows) {
    if (eStatus !== null && !accepted.has(text(row[eStatus]))) { diagnostics.excludedEnrollments++; continue; }
    const id = text(row[eId]);
    if (!id) { diagnostics.blankEnrollmentIds++; continue; }
    const raw = eCourse === null ? text(config.fixedCourse) : text(row[eCourse]);
    const category = courseMap[raw];
    if (!raw || !Number.isInteger(category) || category < 0 || category >= courseLabels.length) {
      throw new InputError("명단의 모든 과정명을 표준 과목군에 연결하세요. 과정 열이 없으면 단일 과정명을 입력하세요.");
    }
    const link = JSON.stringify([id, raw]);
    if (links.has(link)) { diagnostics.duplicateEnrollments++; continue; }
    links.add(link);
    if (!students.has(id)) { diagnostics.unmatchedEnrollments++; continue; }
    courseNames.set(category, courseLabels[category]);
    students.get(id).courses.add(category);
  }
  const records = [...students.values()];
  if (new Set(records.map(r => r.cohort)).size > 24) throw new InputError("졸업 코호트 값이 24개를 넘습니다. 학번·이름이 아닌 졸업연월 열을 선택하세요.");
  diagnostics.unmatchedGraduates = records.filter(r => !r.courses.size).length;
  if (!records.some(r => r.courses.size)) throw new InputError("학번이 매칭된 참석/이수 내역이 없습니다. 학번 형식과 상태값을 확인하세요.");
  const groups = [];
  function addGroups(list, cohort) {
    groups.push({ kind: "overall", label: "전체 졸업생", cohort, ...stats(list) });
    for (const category of courseNames.keys()) for (const done of [true, false]) {
      const subset = list.filter(r => r.courses.has(category) === done);
      groups.push({ kind: "course", label: `${courseLabels[category]} ${done ? "이수/참석" : "기록 없음"}`, cohort, ...stats(subset) });
    }
    const keys = [...courseNames.keys()];
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const subset = list.filter(r => r.courses.has(keys[i]) && r.courses.has(keys[j]));
      if (subset.length) groups.push({ kind: "combination", label: `${courseLabels[keys[i]]} + ${courseLabels[keys[j]]}`, cohort, ...stats(subset) });
    }
  }
  addGroups(records, "전체");
  const cohorts = [...new Set(records.map(r => r.cohort))];
  if (jCohort !== null) for (const cohort of cohorts) addGroups(records.filter(r => r.cohort === cohort), `코호트: ${cohort}`);
  return { diagnostics, groups, matched: records.length - diagnostics.unmatchedGraduates, graduates: records.length };
}

export function protectedPayload(result) {
  // Sending only cohort-wide, disjoint cells avoids differencing overlapping course groups.
  const minimum = 5;
  const groups = result.groups.filter(g => g.kind === "overall" && g.cohort === "전체");
  const safe = groups.filter(g => g.total >= minimum && g.counts.every(n => n === 0 || n >= minimum));
  const overall = safe.map(g => ({ label: "전체 졸업생", total: g.total, known: g.known, unknown: g.unknown, employed: g.employed, counts: g.counts, rate: g.rate }));
  // Course splits may expose small cells or complements; release only safe full partitions.
  const courseGroups = result.groups.filter(g => g.kind === "course" && g.cohort === "전체");
  const partitions = [];
  for (let i = 0; i < courseGroups.length; i += 2) {
    const pair = courseGroups.slice(i, i + 2);
    if (pair.length === 2 && pair.every(g => g.total >= minimum && g.counts.every(n => n === 0 || n >= minimum))) {
      partitions.push(pair.map(g => ({ label: g.label, total: g.total, known: g.known, unknown: g.unknown, employed: g.employed, counts: g.counts, rate: g.rate })));
    }
  }
  // Only one partition is released: multiple overlapping partitions can reveal small intersections.
  return {
    source: "uploaded_excel_aggregate",
    minimumCell: minimum,
    outcomes: outcomeLabels,
    overall,
    comparison: partitions[0] ?? [],
    limitations: [
      "원본 파일, 학번, 이름, 연락처, 자유 입력 과정명과 코호트는 전송하지 않음.",
      "5명 미만의 비영(非零) 셀이 있는 전체/비교 집계 제외. 교차 추론을 줄이기 위해 안전한 과정 분할 최대 1개만 전송.",
      "조합·코호트별 세부 수치는 로컬에서만 제공. 집계 보호는 완전한 익명성을 보장하지 않으며 기관 승인 필요.",
      "명단에 기록이 없다는 것은 미이수를 확정하지 않음. 취업 현황 미확인은 분모 제외. 인과관계 주장 금지."
    ]
  };
}

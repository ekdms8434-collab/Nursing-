const defaultStandards = [
  { code: "기준 1", name: "비교과 운영계획 및 목표", score: 94, status: "양호", indicator: "프로그램 목표와 핵심역량 연계율 94%", evidence: "비교과 프로그램은 교육목표와 학습성과를 연결해 운영되고 있으며, 목표별 결과를 정기적으로 점검하고 있습니다.", source: "프로그램 계획서, 운영계획서, 참여자 명단" },
  { code: "기준 2", name: "학생 참여 및 만족도", score: 91, status: "양호", indicator: "참여율 91% · 만족도 4.7/5", evidence: "학생의 프로그램 참여율과 만족도는 지속적으로 유지되며, 참여 경험이 학습성과와 연계되고 있습니다.", source: "신청 및 참여 현황, 설문조사, 만족도 결과" },
  { code: "기준 6", name: "성과평가 및 CQI", score: 93, status: "양호", indicator: "개선과제 이행률 93%", evidence: "참여율, 만족도, 성장점수, 산출물 등을 분석해 개선과제를 도출하고 환류하고 있습니다.", source: "성과분석 자료, CQI 회의록, 개선계획서" }
];

const defaultCycle = [
  { step: "1. 문제 발견", desc: "참여도와 만족도에서 특정 프로그램의 학습성과 편차와 지원 부족이 확인됨." },
  { step: "2. 원인 분석", desc: "프로그램별 사전 준비 부족, 활동 시간 배분의 한계, 피드백 부족이 주요 원인으로 파악됨." },
  { step: "3. 개선 실행", desc: "시뮬레이션, 체크리스트, 멘토링, 사전 안내를 강화해 프로그램 운영을 보완함." },
  { step: "4. 성과 검증", desc: "참여율, 만족도, 산출물, 사전·사후 평가를 비교해 개선 효과를 확인함." },
  { step: "5. 환류 및 계획", desc: "다음 학기에는 프로그램 운영 보완과 성과 환류를 계획 중임." }
];

const defaultKpis = [
  { label: "프로그램 참여율", value: "91%", note: "총 신청 대비 실제 참여 비율 유지" },
  { label: "개선과제 이행률", value: "87%", note: "주요 개선과제 6개 중 5개 완료 또는 진행 중" },
  { label: "학생 만족도", value: "4.7/5", note: "비교과 만족도 평균 4.7점 유지" },
  { label: "차기 개선 계획", value: "5건", note: "운영 보완, 환류, 결과 정리" }
];

const defaultChecklist = [
  { label: "비교과 프로그램의 목표와 핵심역량 연계가 명확한가", note: "운영계획서와 학습성과가 일치하는지 확인", status: "완료" },
  { label: "참여율, 만족도, 성과지표가 증거와 함께 제시되는가", note: "설문과 운영실적을 함께 연결해 설명하는지 검토", status: "완료" },
  { label: "개선과제와 환류계획이 다음 학기 운영에 반영되는가", note: "과제별 담당자와 실행 시점이 구체적으로 제시되는지 확인", status: "진행" }
];

const defaultActions = [
  { task: "프로그램 만족도 환류 및 설문 운영 개선", owner: "비교과운영위원회", due: "2027년 1학기", progress: "진행" },
  { task: "산출물 표준화 및 활동 증빙 정리", owner: "비교과 운영팀", due: "2027년 2학기", progress: "계획" },
  { task: "개선과제 우선순위 재설정 및 실행점검", owner: "비교과 운영팀", due: "2027년 2학기", progress: "계획" }
];

const defaultReportSections = [
  { title: "1. 비교과 운영 개요", content: "비교과 프로그램은 교육목표와 핵심역량을 연결해 운영하고 있으며, 참여자 중심의 체계적 설계와 지속적 환류를 통해 성과를 관리한다." },
  { title: "2. 참여 및 만족도", content: "학생 참여율, 만족도, 사전·사후 평가를 통해 비교과 활동의 교육적 효과와 개선점을 분석하고 있다." },
  { title: "3. 기준별 활동 및 증거", content: "각 기준별로 운영 계획, 증거자료, 학생 반응, 성과지표를 연결해 설명하고, 미흡한 영역은 개선계획을 제시한다." },
  { title: "4. 개선 및 환류", content: "다음 학기에는 프로그램 운영 보완, 산출물 표준화와 만족도 환류를 중심으로 개선을 추진한다." }
];

const forbiddenPattern = /취약학생|안전관리|안전한|안전|취약/;
const legacyCodes = new Set(["기준 3", "기준 4", "기준 5", "기준 7"]);

export function defaultCqiData() {
  return {
    standards: defaultStandards.map(item => ({ ...item })),
    cycle: defaultCycle.map(item => ({ ...item })),
    kpis: defaultKpis.map(item => ({ ...item })),
    checklist: defaultChecklist.map(item => ({ ...item })),
    actions: defaultActions.map(item => ({ ...item })),
    reportSections: defaultReportSections.map(item => ({ ...item }))
  };
}

function text(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function listOrFallback(list, fallback) {
  return Array.isArray(list) && list.length > 0 ? list : fallback;
}

export function sanitizeCqiData(data) {
  const fallback = defaultCqiData();
  const source = data && typeof data === "object" ? data : fallback;

  const standards = listOrFallback(source.standards, fallback.standards)
    .filter(item => !legacyCodes.has(text(item?.code)))
    .filter(item => !forbiddenPattern.test([item?.name, item?.indicator, item?.evidence].map(text).join(" ")))
    .map(item => ({
      code: text(item?.code) || "기준",
      name: text(item?.name) || "비교과 운영 기준",
      score: Number(item?.score) || 0,
      status: text(item?.status) || "양호",
      indicator: text(item?.indicator) || "",
      evidence: text(item?.evidence) || "",
      source: text(item?.source) || ""
    }));

  const cycle = listOrFallback(source.cycle, fallback.cycle)
    .filter(item => !forbiddenPattern.test([item?.step, item?.desc].map(text).join(" ")))
    .map(item => ({
      step: text(item?.step) || "개선 단계",
      desc: text(item?.desc) || ""
    }));

  const kpis = listOrFallback(source.kpis, fallback.kpis)
    .filter(item => !forbiddenPattern.test([item?.label, item?.value, item?.note].map(text).join(" ")))
    .map(item => ({
      label: text(item?.label) || "지표",
      value: text(item?.value) || "",
      note: text(item?.note) || ""
    }));

  const checklist = listOrFallback(source.checklist, fallback.checklist)
    .filter(item => !forbiddenPattern.test([item?.label, item?.note].map(text).join(" ")))
    .map(item => ({
      label: text(item?.label) || "체크리스트 항목",
      note: text(item?.note) || "",
      status: text(item?.status) || "확인"
    }));

  const actions = listOrFallback(source.actions, fallback.actions)
    .filter(item => !forbiddenPattern.test([item?.task, item?.owner, item?.due].map(text).join(" ")))
    .map(item => ({
      task: text(item?.task) || "개선과제",
      owner: text(item?.owner) || "담당자",
      due: text(item?.due) || "",
      progress: text(item?.progress) || "계획"
    }));

  const reportSections = listOrFallback(source.reportSections, fallback.reportSections)
    .filter(item => !forbiddenPattern.test([item?.title, item?.content].map(text).join(" ")))
    .map(item => ({
      title: text(item?.title) || "서식 항목",
      content: text(item?.content) || ""
    }));

  return {
    standards: standards.length ? standards : fallback.standards,
    cycle: cycle.length ? cycle : fallback.cycle,
    kpis: kpis.length ? kpis : fallback.kpis,
    checklist: checklist.length ? checklist : fallback.checklist,
    actions: actions.length ? actions : fallback.actions,
    reportSections: reportSections.length ? reportSections : fallback.reportSections
  };
}

if (typeof window !== "undefined") {
  window.defaultCqiData = defaultCqiData;
  window.sanitizeCqiData = sanitizeCqiData;
}

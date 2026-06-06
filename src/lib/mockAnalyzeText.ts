import type { Task } from "@/types/task";

const TITLE_RULES: Array<[RegExp, string]> = [
  [/报送|提交|上交|交学院|交材料/, "提交材料"],
  [/催交|催/, "催交材料"],
  [/收齐|收集|收材料/, "收齐材料"],
  [/汇总/, "汇总材料"],
  [/统计/, "统计数据"],
  [/通知|提醒/, "发送通知"],
  [/填写|填报/, "填写表格"],
  [/上传/, "上传系统"],
  [/导出/, "导出名单"],
  [/整理|归档/, "整理档案"],
  [/联系/, "联系人员"],
  [/答辩/, "安排答辩"],
  [/实习/, "安排实习"],
  [/考试/, "安排考试"],
  [/会议/, "组织会议"],
];

function createTemporaryId(index: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `mock-${crypto.randomUUID()}`;
  }

  return `mock-${Date.now()}-${index}`;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateFromOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return formatDate(date);
}

function parseDeadlineDate(text: string) {
  const explicitDate = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);

  if (explicitDate) {
    const [, year, month, day] = explicitDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (text.includes("后天")) {
    return dateFromOffset(2);
  }

  if (text.includes("明天")) {
    return dateFromOffset(1);
  }

  if (text.includes("今天")) {
    return dateFromOffset(0);
  }

  return null;
}

function parseDeadlineTime(text: string) {
  const digitalTime = text.match(/([01]?\d|2[0-3])[:：]([0-5]\d)/);

  if (digitalTime) {
    const [, hour, minute] = digitalTime;
    return `${hour.padStart(2, "0")}:${minute}`;
  }

  const chineseTime = text.match(/(上午|下午|晚上)?\s*(\d{1,2})[点时](半|([0-5]\d)分?)?/);

  if (!chineseTime) {
    return null;
  }

  const [, period, rawHour, half, rawMinute] = chineseTime;
  let hour = Number(rawHour);

  if ((period === "下午" || period === "晚上") && hour < 12) {
    hour += 12;
  }

  const minute = half === "半" ? "30" : rawMinute?.padStart(2, "0") ?? "00";

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function getConciseTaskTitle(text: string, index: number) {
  const compactText = text.replace(/\s+/g, "");

  if (!compactText) {
    return `待办${index + 1}`;
  }

  const matchedRule = TITLE_RULES.find(([pattern]) => pattern.test(compactText));

  if (matchedRule) {
    return matchedRule[1];
  }

  const fallbackTitle = compactText
    .replace(/今天|明天|后天|本周[一二三四五六日天]|下周[一二三四五六日天]|本月底|下个月初/g, "")
    .replace(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/g, "")
    .replace(/(上午|下午|晚上)?\d{1,2}[:：]\d{2}/g, "")
    .replace(/(上午|下午|晚上)?\d{1,2}[点时](半|[0-5]\d分?)?/g, "")
    .replace(/[，。；;,.、：:！!？?（）()【】[\]"“”'‘’]/g, "")
    .trim();

  const title = fallbackTitle || compactText;

  return title.length > 10 ? title.slice(0, 10) : title;
}

export function mockAnalyzeText(text: string): Task[] {
  const sourceText = text.trim();
  const deadlineDate = parseDeadlineDate(sourceText);

  // Mock only: keep behavior aligned with real AI mode and return exactly one task.
  return [
    {
      id: createTemporaryId(0),
      title: getConciseTaskTitle(sourceText, 0),
      deadlineDate,
      deadlineTime: parseDeadlineTime(sourceText) ?? (deadlineDate ? "15:00" : null),
      status: "not_started",
      note: "",
      sourceText,
    },
  ];
}

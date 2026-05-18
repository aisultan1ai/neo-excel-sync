export const getLocalYMD = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const parsePodftToday = (data) => {
  const fallback = { count: 0, date: getLocalYMD() };
  if (data == null) return fallback;
  if (typeof data === "number") {
    return { count: Number.isFinite(data) ? data : 0, date: getLocalYMD() };
  }
  if (typeof data === "object") {
    const rawCount = data.count ?? data.total ?? data.n ?? data.value ?? 0;
    const rawDate = data.date ?? data.day ?? data.today ?? getLocalYMD();
    const count = Number(rawCount);
    return {
      count: Number.isFinite(count) ? count : 0,
      date: String(rawDate || getLocalYMD()),
    };
  }
  return fallback;
};

export const fmtUSD = (v, decimals = 2) => {
  if (v == null || Number.isNaN(v)) return "—";
  return `USD ${Number(v).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

export const fmtNum = (v, decimals = 2) => {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const fmtPct = (v, decimals = 2) => {
  if (v == null || Number.isNaN(v)) return "—";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
};

export const fmtSignedUSD = (v, decimals = 2) => {
  if (v == null || Number.isNaN(v)) return "—";
  const n = Number(v);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}USD ${abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

export const incomeColor = (v) => {
  const n = Number(v || 0);
  if (n > 0) return "#1E7B34";
  if (n < 0) return "#B22222";
  return "#1e293b";
};

// "31.08.2026" → "31 August 2026"
export const prettyDate = (d) => {
  if (!d) return "—";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d);
  if (!m) return d;
  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  return `${m[1]} ${months[parseInt(m[2], 10) - 1]} ${m[3]}`;
};

export const HTTP_REQUEST_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

function labelKey(labels = {}) {
  return JSON.stringify(labels, Object.keys(labels).sort());
}

function renderLabels(labels = {}) {
  const keys = Object.keys(labels);
  if (keys.length === 0) return '';
  const inner = keys
    .sort()
    .map(
      (key) =>
        `${key}="${String(labels[key]).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    )
    .join(',');
  return `{${inner}}`;
}

function renderNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

/**
 * Minimal Prometheus text-format registry with counters, histograms and
 * gauges. Dependency-free on purpose so the API keeps a small footprint;
 * the output is compatible with Prometheus text exposition format 0.0.4.
 */
export function createMetricsRegistry() {
  const counters = new Map();
  const histograms = new Map();
  const gauges = new Map();

  const registry = {
    inc(name, labels, amount = 1) {
      if (!counters.has(name)) counters.set(name, new Map());
      const byLabels = counters.get(name);
      const key = labelKey(labels);
      byLabels.set(key, (byLabels.get(key) ?? 0) + amount);
    },

    observe(name, labels, value) {
      if (!histograms.has(name)) histograms.set(name, new Map());
      const byLabels = histograms.get(name);
      const key = labelKey(labels);
      const entry =
        byLabels.get(key) ?? {
          sum: 0,
          count: 0,
          buckets: new Array(HTTP_REQUEST_DURATION_BUCKETS.length).fill(0),
        };
      entry.sum += value;
      entry.count += 1;
      for (let i = 0; i < HTTP_REQUEST_DURATION_BUCKETS.length; i += 1) {
        if (value <= HTTP_REQUEST_DURATION_BUCKETS[i]) entry.buckets[i] += 1;
      }
      byLabels.set(key, entry);
    },

    setGauge(name, labels, value) {
      if (!gauges.has(name)) gauges.set(name, new Map());
      gauges.get(name).set(labelKey(labels), value);
    },

    render() {
      const lines = [];
      const display = (key) => renderLabels(JSON.parse(key));

      for (const [name, byLabels] of counters) {
        lines.push(`# TYPE ${name} counter`);
        for (const [key, value] of byLabels) {
          lines.push(`${name}${display(key)} ${renderNumber(value)}`);
        }
      }

      for (const [name, byLabels] of histograms) {
        lines.push(`# TYPE ${name} histogram`);
        for (const [key, entry] of byLabels) {
          const baseLabels = JSON.parse(key);
          let cumulative = 0;
          for (let i = 0; i < HTTP_REQUEST_DURATION_BUCKETS.length; i += 1) {
            cumulative += entry.buckets[i];
            lines.push(
              `${name}_bucket${renderLabels({ ...baseLabels, le: HTTP_REQUEST_DURATION_BUCKETS[i] })} ${cumulative}`,
            );
          }
          lines.push(
            `${name}_bucket${renderLabels({ ...baseLabels, le: '+Inf' })} ${entry.count}`,
          );
          lines.push(`${name}_sum${display(key)} ${entry.sum.toFixed(3)}`);
          lines.push(`${name}_count${display(key)} ${entry.count}`);
        }
      }

      for (const [name, byLabels] of gauges) {
        lines.push(`# TYPE ${name} gauge`);
        for (const [key, value] of byLabels) {
          lines.push(`${name}${display(key)} ${renderNumber(value)}`);
        }
      }

      return `${lines.join('\n')}\n`;
    },
  };

  return registry;
}

import { setListMessage } from "../ui/dom.js";

function drawBlendshapeChart(chartContext, chartCanvas, items, colors) {
  const { width, height } = chartCanvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 96;
  const innerRadius = 52;

  chartContext.clearRect(0, 0, width, height);

  if (!items.length) {
    chartContext.save();
    chartContext.fillStyle = "rgba(31, 39, 33, 0.08)";
    chartContext.beginPath();
    chartContext.arc(centerX, centerY, radius, 0, Math.PI * 2);
    chartContext.fill();
    chartContext.fillStyle = "rgba(31, 39, 33, 0.14)";
    chartContext.beginPath();
    chartContext.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    chartContext.fill();
    chartContext.fillStyle = "#5d665f";
    chartContext.font = '600 15px "Segoe UI", "Yu Gothic UI", sans-serif';
    chartContext.textAlign = "center";
    chartContext.fillText("No face", centerX, centerY + 5);
    chartContext.restore();
    return;
  }

  const total = items.reduce((sum, item) => sum + item.score, 0) || 1;
  let startAngle = -Math.PI / 2;
  items.forEach((item, index) => {
    const sliceAngle = (item.score / total) * Math.PI * 2;
    chartContext.save();
    chartContext.beginPath();
    chartContext.moveTo(centerX, centerY);
    chartContext.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    chartContext.closePath();
    chartContext.fillStyle = colors[index % colors.length];
    chartContext.fill();
    chartContext.restore();
    startAngle += sliceAngle;
  });

  chartContext.save();
  chartContext.beginPath();
  chartContext.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  chartContext.fillStyle = "#fffaf2";
  chartContext.fill();
  chartContext.fillStyle = "#1f2721";
  chartContext.textAlign = "center";
  chartContext.font = '700 14px "Segoe UI", "Yu Gothic UI", sans-serif';
  chartContext.fillText("Top", centerX, centerY - 8);
  chartContext.font = '700 18px "Segoe UI", "Yu Gothic UI", sans-serif';
  chartContext.fillText(items[0].score.toFixed(2), centerX, centerY + 18);
  chartContext.restore();
}

export function createBlendshapeView({ chartCanvas, listElement, colors }) {
  const chartContext = chartCanvas.getContext("2d");

  function render(items) {
    drawBlendshapeChart(chartContext, chartCanvas, items, colors);

    if (!items.length) {
      setListMessage(listElement, "顔未検出、または blendshape 無効");
      return;
    }

    const listItems = items.map((item, index) => {
      const marker = document.createElement("span");
      marker.className = "blendshape-color-marker";
      marker.style.background = colors[index % colors.length];

      const listItem = document.createElement("li");
      listItem.append(marker, `${item.name}: ${item.score.toFixed(3)}`);
      return listItem;
    });

    listElement.replaceChildren(...listItems);
  }

  function reset() {
    drawBlendshapeChart(chartContext, chartCanvas, [], colors);
    setListMessage(listElement, "入力待ち");
  }

  return {
    render,
    reset,
  };
}

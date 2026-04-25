const {
  apiFetch,
  createBadge,
  escapeHtml,
  formatHours,
  formatPercent,
  setText
} = window.boardShared;

let hoursChart;
let trendChart;

document.addEventListener('DOMContentLoaded', async () => {
  bindBoardEvents();
  await loadBoardData();
});

function bindBoardEvents() {
  document.querySelector('#logoutButton')?.addEventListener('click', async () => {
    await apiFetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  document.querySelector('#refreshButton')?.addEventListener('click', async () => {
    const statusElement = document.querySelector('#statusMessage');
    statusElement.textContent = '正在执行华为云 IAM 验证...';

    try {
      const result = await apiFetch('/api/refresh', { method: 'POST' });
      const verification = result.runtime.apiVerification;
      statusElement.textContent = verification?.ok
        ? 'IAM 验证成功，已更新刷新状态。'
        : 'IAM 验证未通过。';
      await loadBoardData();
    } catch (error) {
      statusElement.textContent = error.message;
    }
  });
}

async function loadBoardData() {
  const [sessionResponse, reportsResponse, historyResponse] = await Promise.all([
    apiFetch('/api/session'),
    apiFetch('/api/reports'),
    apiFetch('/api/history?period=weeks')
  ]);

  renderHeader(sessionResponse, reportsResponse.report.date);
  renderMetrics(reportsResponse.report, reportsResponse.runtime);
  renderTeamTable(reportsResponse.report.teams);
  renderRisks(reportsResponse.report.risks);
  renderCharts(reportsResponse.report, historyResponse.history.items);
}

function renderHeader(sessionResponse, reportDate) {
  setText('#projectName', sessionResponse.project.name);
  setText(
    '#projectMeta',
    `${sessionResponse.project.id} · 最新日报 ${reportDate}`
  );
  setText(
    '#currentUser',
    `${sessionResponse.user.displayName}（${sessionResponse.user.role}）`
  );
}

function renderMetrics(report, runtime) {
  const fillRateAverage =
    report.teams.reduce((sum, team) => sum + team.fillRate, 0) / report.teams.length;
  const completionAverage =
    report.teams.reduce((sum, team) => sum + team.completionRate, 0) / report.teams.length;
  const totalBugs = report.teams.reduce((sum, team) => sum + Number(team.bugs || 0), 0);
  const totalMissingPeople = report.teams.reduce(
    (sum, team) => sum + team.missingMembers.length,
    0
  );
  const filledPeople = report.teams.reduce((sum, team) => sum + Number(team.people || 0), 0);
  const totalMembers = report.teams.reduce(
    (sum, team) => sum + Number(team.totalMembers || 0),
    0
  );

  setText('#metricHours', formatHours(report.summary.totalHours));
  setText('#metricPeople', String(report.summary.totalPeople));
  setText('#metricTeams', String(report.summary.totalTeams));
  setText('#metricBugs', String(totalBugs));
  setText('#metricFillRate', formatPercent(fillRateAverage));
  setText('#metricCompletion', formatPercent(completionAverage));
  setText(
    '#metricRefresh',
    runtime.lastRefreshAt ? runtime.lastRefreshAt.replace('T', ' ').slice(0, 19) : '尚未执行'
  );
  setText(
    '#runtimeStatus',
    runtime.apiVerification?.ok
      ? `通过 · ${runtime.apiVerification.checkedAt.replace('T', ' ').slice(0, 19)}`
      : runtime.apiVerification?.error || '尚未执行'
  );

  const verificationElement = document.querySelector('#verificationResult');
  if (!runtime.apiVerification) {
    verificationElement.textContent = '尚未触发 IAM 验证';
  } else {
    verificationElement.textContent = runtime.apiVerification.ok
      ? `上次验证通过：${runtime.apiVerification.checkedAt.replace('T', ' ').slice(0, 19)}`
      : `上次验证失败：${runtime.apiVerification.error}`;
  }

  renderTeamChips(report.teams);
  renderFillRates(report.teams);
  renderRankings(report.teams);
  renderDistribution(report.teams);
  renderSummaryStats({
    teams: report.teams,
    totalMissingPeople,
    filledPeople,
    totalMembers,
    totalBugs
  });
}

function renderTeamTable(teams) {
  const tbody = document.querySelector('#teamTableBody');
  tbody.innerHTML = teams
    .map(
      (team) => `
        <tr>
          <td>${escapeHtml(team.name)}</td>
          <td>${formatHours(team.hours)}</td>
          <td>${formatHours(team.estimatedHours)}</td>
          <td>${formatPercent(team.fillRate)}</td>
          <td>${formatPercent(team.completionRate)}</td>
          <td>${team.bugs}</td>
          <td>${team.missingMembers.length ? escapeHtml(team.missingMembers.join('、')) : '无'}</td>
        </tr>
      `
    )
    .join('');
}

function renderRisks(risks) {
  const container = document.querySelector('#riskList');
  container.innerHTML = risks.length
    ? risks
        .map(
          (risk) => `
            <article class="risk-item">
              <div>${createBadge(risk.level)}</div>
              <h3>${escapeHtml(risk.type)} · ${escapeHtml(risk.team)}</h3>
              <p>${escapeHtml(risk.description)}</p>
              <p class="muted">建议：${escapeHtml(risk.suggestion)}</p>
            </article>
          `
        )
        .join('')
    : '<p class="muted">当前暂无风险项。</p>';
}

function renderTeamChips(teams) {
  const container = document.querySelector('#teamChips');
  container.innerHTML = teams
    .map(
      (team) => `
        <span class="team-chip">
          <span class="team-chip-dot"></span>
          ${escapeHtml(team.name)}
        </span>
      `
    )
    .join('');
}

function renderFillRates(teams) {
  const container = document.querySelector('#fillRateList');
  container.innerHTML = teams
    .map(
      (team) => `
        <article class="progress-item">
          <div class="progress-head">
            <span>${escapeHtml(team.name)}</span>
            <strong>${formatPercent(team.fillRate)}</strong>
          </div>
          <div class="progress-track">
            <div class="progress-bar" style="width: ${Math.round(team.fillRate * 100)}%;"></div>
          </div>
        </article>
      `
    )
    .join('');
}

function renderRankings(teams) {
  const sorted = [...teams].sort((left, right) => right.fillRate - left.fillRate);
  const renderList = (selector, items, reverse = false) => {
    const container = document.querySelector(selector);
    container.innerHTML = items
      .map((team, index) => {
        const rank = reverse ? teams.length - items.length + index + 1 : index + 1;
        return `
          <article class="rank-item">
            <span class="rank-index">${rank}</span>
            <div class="rank-body">
              <div class="rank-name">${escapeHtml(team.name)}</div>
              <div class="rank-meta">填报率 ${formatPercent(team.fillRate)} · ${team.people}/${team.totalMembers}</div>
            </div>
          </article>
        `;
      })
      .join('');
  };

  renderList('#rankTopList', sorted.slice(0, 5));
  renderList('#rankBottomList', [...sorted].reverse().slice(0, 5), true);
}

function renderDistribution(teams) {
  const buckets = [
    { label: '90% 以上', min: 0.9, max: Infinity },
    { label: '80% - 89%', min: 0.8, max: 0.9 },
    { label: '70% - 79%', min: 0.7, max: 0.8 },
    { label: '70% 以下', min: -Infinity, max: 0.7 }
  ];
  const container = document.querySelector('#distributionList');
  container.innerHTML = buckets
    .map((bucket) => {
      const count = teams.filter(
        (team) => team.fillRate >= bucket.min && team.fillRate < bucket.max
      ).length;
      return `
        <div class="distribution-item">
          <span>${bucket.label}</span>
          <strong>${count} 个团队</strong>
        </div>
      `;
    })
    .join('');
}

function renderSummaryStats({ teams, totalMissingPeople, filledPeople, totalMembers, totalBugs }) {
  const summaryContainer = document.querySelector('#summaryStats');
  const personnelContainer = document.querySelector('#personnelStats');
  const highRiskTeams = teams.filter((team) => team.completionRate < 0.75).length;
  const overtimeTeams = teams.filter((team) => team.hours > team.estimatedHours).length;
  const completedTeams = teams.filter((team) => team.completionRate >= 0.8).length;

  summaryContainer.innerHTML = [
    ['高风险团队', `${highRiskTeams}`],
    ['超预估团队', `${overtimeTeams}`],
    ['完成率达标', `${completedTeams}`],
    ['Bug 合计', `${totalBugs}`]
  ]
    .map(
      ([label, value]) => `
        <div class="mini-stat">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join('');

  personnelContainer.innerHTML = [
    ['应填报人数', `${totalMembers}`],
    ['已填报人数', `${filledPeople}`],
    ['未填报人数', `${totalMissingPeople}`],
    ['团队总数', `${teams.length}`]
  ]
    .map(
      ([label, value]) => `
        <div class="mini-stat">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join('');
}

function renderCharts(report, historyItems) {
  const hoursContext = document.querySelector('#hoursChart');
  const trendContext = document.querySelector('#trendChart');

  if (hoursChart) {
    hoursChart.destroy();
  }
  if (trendChart) {
    trendChart.destroy();
  }

  hoursChart = new Chart(hoursContext, {
    type: 'bar',
    data: {
      labels: report.teams.map((team) => team.name),
      datasets: [
        {
          label: '完成率',
          data: report.teams.map((team) => Math.round(team.completionRate * 100)),
          backgroundColor: '#4f7cff',
          borderRadius: 10,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Bug 数',
          data: report.teams.map((team) => team.bugs),
          borderColor: '#f97316',
          backgroundColor: '#f97316',
          tension: 0.35,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback(value) {
              return `${value}%`;
            }
          }
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });

  trendChart = new Chart(trendContext, {
    type: 'line',
    data: {
      labels: historyItems.map((item) => item.label),
      datasets: [
        {
          label: '周度工时',
          data: historyItems.map((item) => item.totalHours),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.16)',
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

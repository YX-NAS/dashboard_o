const retrospectShared = window.boardShared;

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelector('#logoutButton')?.addEventListener('click', async () => {
    await retrospectShared.apiFetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  const response = await retrospectShared.apiFetch('/api/reports');
  renderRetrospect(response.report, response.project);
});

function renderRetrospect(report, project) {
  retrospectShared.setText('#projectName', project.name);
  retrospectShared.setText('#projectMeta', `复盘日期：${report.date}`);

  const fillRateAverage =
    report.teams.reduce((sum, team) => sum + team.fillRate, 0) / report.teams.length;
  const worstVarianceTeam = [...report.teams].sort(
    (left, right) =>
      Math.abs(right.hours - right.estimatedHours) -
      Math.abs(left.hours - left.estimatedHours)
  )[0];
  const slowestTeam = [...report.teams].sort(
    (left, right) => left.completionRate - right.completionRate
  )[0];

  document.querySelector('#summaryList').innerHTML = `
    <article class="summary-item">
      <h3>整体工时</h3>
      <p>当日累计工时 ${retrospectShared.formatHours(report.summary.totalHours)}，覆盖 ${report.summary.totalPeople} 人。</p>
    </article>
    <article class="summary-item">
      <h3>填报情况</h3>
      <p>平均填报率 ${retrospectShared.formatPercent(fillRateAverage)}，需持续跟进未填报名单。</p>
    </article>
    <article class="summary-item">
      <h3>最大偏差团队</h3>
      <p>${retrospectShared.escapeHtml(worstVarianceTeam.name)} 实际 ${retrospectShared.formatHours(worstVarianceTeam.hours)}，预估 ${retrospectShared.formatHours(worstVarianceTeam.estimatedHours)}。</p>
    </article>
    <article class="summary-item">
      <h3>进度关注点</h3>
      <p>${retrospectShared.escapeHtml(slowestTeam.name)} 当前完成率 ${retrospectShared.formatPercent(slowestTeam.completionRate)}，建议优先排查阻塞。</p>
    </article>
  `;

  document.querySelector('#timeline').innerHTML = report.teams
    .map(
      (team) => `
        <article class="timeline-item">
          <h3>${retrospectShared.escapeHtml(team.name)}</h3>
          <p>工时 ${retrospectShared.formatHours(team.hours)}，填报率 ${retrospectShared.formatPercent(team.fillRate)}，完成率 ${retrospectShared.formatPercent(team.completionRate)}。</p>
          <p class="muted">未填报成员：${team.missingMembers.length ? retrospectShared.escapeHtml(team.missingMembers.join('、')) : '无'}</p>
        </article>
      `
    )
    .join('');

  document.querySelector('#riskList').innerHTML = report.risks
    .map(
      (risk) => `
        <article class="risk-item">
          <div>${retrospectShared.createBadge(risk.level)}</div>
          <h3>${retrospectShared.escapeHtml(risk.team)} · ${retrospectShared.escapeHtml(risk.type)}</h3>
          <p>${retrospectShared.escapeHtml(risk.description)}</p>
          <p class="muted">建议：${retrospectShared.escapeHtml(risk.suggestion)}</p>
        </article>
      `
    )
    .join('');
}

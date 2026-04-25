const sprintShared = window.boardShared;

document.addEventListener('DOMContentLoaded', async () => {
  bindSprintEvents();
  const response = await sprintShared.apiFetch('/api/reports');
  renderSprintPage(response.report, response.project);
});

function bindSprintEvents() {
  document.querySelector('#logoutButton')?.addEventListener('click', async () => {
    await sprintShared.apiFetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
}

function renderSprintPage(report, project) {
  sprintShared.setText('#projectName', project.name);
  sprintShared.setText('#projectMeta', `迭代详情 · ${report.date}`);

  const container = document.querySelector('#sprintPanels');
  container.innerHTML = report.teams
    .map(
      (team) => `
        <section class="panel">
          <h2>${sprintShared.escapeHtml(team.name)}</h2>
          <p class="muted">当前完成率 ${sprintShared.formatPercent(team.completionRate)}，Bug ${team.bugs} 个。</p>
          <div class="story-list" style="margin-top: 16px;">
            ${team.sprints
              .map(
                (sprint) => `
                  <article class="story-item">
                    <p><strong>${sprintShared.escapeHtml(sprint.name)}</strong></p>
                    <p>迭代完成率：${sprintShared.formatPercent(sprint.completionRate)}</p>
                  </article>
                `
              )
              .join('')}
            ${team.stories
              .map(
                (story) => `
                  <article class="story-item">
                    <p><strong>${sprintShared.escapeHtml(story.name)}</strong></p>
                    <p>责任人：${sprintShared.escapeHtml(story.person)} · 进度 ${sprintShared.formatPercent(story.completionRate)}</p>
                  </article>
                `
              )
              .join('')}
          </div>
        </section>
      `
    )
    .join('');
}

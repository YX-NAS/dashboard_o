const { apiFetch } = window.boardShared;

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.querySelector('#loginForm');
  const errorElement = document.querySelector('#loginError');

  try {
    await apiFetch('/api/session', { redirectOnUnauthorized: false });
    window.location.href = '/board.html';
    return;
  } catch (error) {
    // Keep user on login page when there is no active session.
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorElement.textContent = '';

    const formData = new FormData(form);
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '');

    try {
      await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      window.location.href = '/board.html';
    } catch (error) {
      errorElement.textContent = error.message;
    }
  });
});

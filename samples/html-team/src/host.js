/** A tiny host app. "Send invite" is simulated: nothing leaves the browser. */
const members = [
  { name: 'Ada Owner', email: 'ada@example.com', role: 'Owner' },
  { name: 'Ben Editor', email: 'ben@example.com', role: 'Editor' },
];

export function mountHost(app) {
  const render = () => {
    app.replaceChildren();
    if (location.hash === '#/team') renderTeam(app);
    else app.innerHTML = '<h1>Welcome</h1><p>Open the Team page to manage your workspace.</p>';
  };
  addEventListener('hashchange', render);
  render();
}

function renderTeam(app) {
  app.innerHTML = `
    <h1>Team</h1>
    <button type="button" id="invite-btn" data-heypointer-id="invite-teammate">Invite teammate</button>
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
      <tbody>${members.map((m) => `<tr><td>${m.name}</td><td>${m.email}</td><td>${m.role}</td></tr>`).join('')}</tbody></table>
    <div id="status" role="status"></div>
    <dialog id="invite-dialog" aria-labelledby="invite-title">
      <form method="dialog" id="invite-form">
        <h2 id="invite-title">Invite teammate</h2>
        <label for="invite-email">Email</label>
        <input id="invite-email" type="email" required />
        <label for="invite-role">Role</label>
        <select id="invite-role"><option>Viewer</option><option>Editor</option></select>
        <p><button type="submit" data-heypointer-id="send-invite">Send invite</button>
        <button type="button" id="invite-cancel">Cancel</button></p>
      </form>
    </dialog>`;
  const dlg = app.querySelector('#invite-dialog');
  const form = app.querySelector('#invite-form');
  app.querySelector('#invite-btn').addEventListener('click', () => dlg.show());
  app.querySelector('#invite-cancel').addEventListener('click', () => dlg.close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const email = app.querySelector('#invite-email').value;
    const role = app.querySelector('#invite-role').value;
    dlg.close();
    const status = app.querySelector('#status');
    status.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = `Invite sent to ${email} as ${role}`; // textContent: user input never parsed as HTML
    status.append(t);
  });
}

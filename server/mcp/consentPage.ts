const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface ConsentPageInput {
  requestId: string;
  clientName: string;
  /** Host that will receive the access code, from the client's redirect URI. */
  redirectHost: string;
  /** 'password' shows no vault data; 'scope' is rendered only after the password was verified. */
  step: 'password' | 'scope';
  headings?: string[];
  folders?: string[];
  error?: string;
  /** Pre-filled connection name; defaults to the client name. */
  name?: string;
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#fafaf9;color:#1c1917;-webkit-font-smoothing:antialiased}
main{width:100%;max-width:28rem;border:1px solid #e7e5e4;border-radius:16px;background:#fff;padding:32px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.brand{font-size:.875rem;font-weight:600;color:#78716c;margin:0 0 8px}
h1{font-size:1.5rem;margin:0 0 8px}
p{margin:0 0 16px;color:#57534e;font-size:.9rem;line-height:1.4}
label.field{display:block;font-size:.875rem;font-weight:500;margin:16px 0 8px}
input[type=text],input[type=password]{width:100%;border:1px solid #d6d3d1;border-radius:12px;background:#fafaf9;padding:12px;font:inherit;color:inherit}
fieldset{border:1px solid #e7e5e4;border-radius:12px;margin:16px 0 0;padding:12px 16px}
legend{font-size:.875rem;font-weight:500;padding:0 6px}
.opt{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:.9rem}
.opt input{width:1.1rem;height:1.1rem}
button{width:100%;margin-top:24px;min-height:56px;border:0;border-radius:12px;background:#1c1917;color:#fafaf9;font:inherit;font-weight:600;cursor:pointer}
.error{margin:16px 0 0;padding:12px;border-radius:12px;background:#f5f5f4;border:1px solid #a8a29e;color:#292524;font-size:.875rem}
.dest{margin:0 0 16px;padding:12px;border-radius:12px;background:#f5f5f4;border:1px solid #d6d3d1;color:#292524;font-size:.9rem}
.warn{margin:8px 0 0;padding:12px;border-radius:12px;background:#e7e5e4;border:2px solid #44403c;color:#1c1917;font-size:.875rem;font-weight:600}
.hint{font-size:.8rem;color:#78716c;margin:8px 0 0}
@media (prefers-color-scheme:dark){
body{background:#0c0a09;color:#f5f5f4}
main{background:#1c1917;border-color:#292524}
.brand,.hint{color:#a8a29e}
p{color:#d6d3d1}
input[type=text],input[type=password]{background:#0c0a09;border-color:#44403c}
fieldset{border-color:#292524}
button{background:#f5f5f4;color:#1c1917}
.error{background:#292524;border-color:#78716c;color:#f5f5f4}
.dest{background:#292524;border-color:#44403c;color:#f5f5f4}
.warn{background:#292524;border-color:#d6d3d1;color:#fafaf9}
}`;

function options(field: string, values: string[], emptyLabel?: string): string {
  return values
    .map(value => `<label class="opt"><input type="checkbox" name="${field}" value="${escapeHtml(value)}"> <span>${escapeHtml(value === '' && emptyLabel ? emptyLabel : value)}</span></label>`)
    .join('\n');
}

const KNOWN_HOSTS = ['claude.ai', 'claude.com', 'chatgpt.com', 'openai.com', 'gemini.google.com', 'localhost', '127.0.0.1'];

/** True for a well-known AI provider host (or a subdomain of one); ports are ignored. */
export function isKnownRedirectHost(host: string): boolean {
  const name = host.toLowerCase().replace(/:\d+$/, '');
  return KNOWN_HOSTS.some(known => name === known || name.endsWith(`.${known}`));
}

/** Consent screen for a new AI connection. Step 1 asks for the password only; the scope step follows once it is verified. */
export function renderConsentPage(input: ConsentPageInput): string {
  const error = input.error ? `<p class="error" role="alert">${escapeHtml(input.error)}</p>` : '';
  const warning = isKnownRedirectHost(input.redirectHost)
    ? ''
    : `<p class="warn" role="alert">Warning: ${escapeHtml(input.redirectHost)} is not a known AI app. Only continue if you started this connection yourself.</p>`;
  const destination = `<div class="dest">Daymark will send access to <strong>${escapeHtml(input.redirectHost)}</strong>${warning}</div>`;
  const headings = input.headings?.length
    ? `<fieldset><legend>Headings</legend>${options('headings', input.headings)}</fieldset>`
    : '';
  const folders = input.folders?.length
    ? `<fieldset><legend>Note folders</legend>${options('folders', input.folders, '(top level)')}</fieldset>`
    : '';
  const body = input.step === 'password'
    ? `<p>Sign in to choose what this AI connection may see. You can change this or disconnect it later in Settings.</p>
${destination}
${error}
<form method="post" action="/oauth/consent">
<input type="hidden" name="requestId" value="${escapeHtml(input.requestId)}">
<input type="hidden" name="stage" value="password">
<label class="field" for="name">Connection name</label>
<input id="name" name="name" type="text" required maxlength="80" value="${escapeHtml(input.name ?? input.clientName)}">
<label class="field" for="password">Daymark password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Continue</button>
</form>`
    : `<p>Choose what this AI connection may see. You can change this or disconnect it later in Settings.</p>
${destination}
${error}
<form method="post" action="/oauth/consent">
<input type="hidden" name="requestId" value="${escapeHtml(input.requestId)}">
<input type="hidden" name="stage" value="grant">
<fieldset>
<legend>Access</legend>
<label class="opt"><input type="radio" name="access" value="full" checked> <span>Read and write</span></label>
<label class="opt"><input type="radio" name="access" value="read-only"> <span>Read only</span></label>
</fieldset>
<fieldset>
<legend>Share</legend>
<label class="opt"><input type="checkbox" name="everything" value="1"> <span>Everything</span></label>
<label class="opt"><input type="checkbox" name="backlog" value="1"> <span>Backlog</span></label>
<label class="opt"><input type="checkbox" name="habits" value="1"> <span>Habits</span></label>
</fieldset>
${headings}
${folders}
<p class="hint">Select at least one thing to share.</p>
<button type="submit">Allow access</button>
</form>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Connect ${escapeHtml(input.clientName)} - Daymark</title>
<style>${CSS}</style>
</head>
<body>
<main>
<p class="brand">Daymark</p>
<h1>Connect ${escapeHtml(input.clientName)}</h1>
${body}
</main>
</body>
</html>`;
}

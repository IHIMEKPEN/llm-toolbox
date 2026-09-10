# Security

LLM Toolbox is meant to help a local model without giving it a full login to the machine.

## Boundaries

- No shell commands
- File tools stay inside the chat working directory
- No browser control, job-apply automation, Notes, or Calendar
- No recursive scan of Voice Memos, Desktop, or Downloads
- `fetch_url` / `web_search` allow only `http(s)` and block credentials, localhost, private IPs, and cloud-metadata hosts. Redirects are re-checked (max 3)
- Explicit media paths cannot read `.ssh`, Keychains, Mail, Messages, or similar locations
- Screenshots are saved under the workspace `_screenshots` folder. Mail / Messages / password apps require an extra setting
- HTTP responses are size- and time-limited; outbound requests are rate-limited
- `~/.llm-toolbox` is created `0700`; JSON files are written `0600`

Tool families can be disabled per chat. An optional OpenAlex contact email is a protected global field and is not used as the user's identity.

## Data

Memory, todos, and accuracy corrections live in `~/.llm-toolbox/` on the user's machine. That directory is not part of the plugin package.

## Reporting issues

Use the Hub page for this plugin. Do not paste secrets into public reports.

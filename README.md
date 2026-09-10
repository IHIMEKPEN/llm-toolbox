# LLM Toolbox

Give local models tools for files, the live web, research, screenshots, audio, video, memory, and todos — without unrestricted shell access.

Install **`oihimekpen/llm-toolbox`** from the LM Studio Hub, then enable it on a chat.

## Tools

| Family | Tools |
|---|---|
| System | `ping`, `get_local_datetime` |
| Files | `workspace_info`, `list_dir`, `read_file`, `write_file`, `replace_text_in_file`, `delete_file` |
| Web | `web_search`, `fetch_url` |
| Research | `search_literature`, `literature_review_brief` |
| Screenshots | `take_screenshot`, `describe_screenshot`, `screenshot_app`, `list_screenshots`, `analyze_image_frames` |
| Audio | `list_workspace_audio`, `get_audio_info`, `transcribe_audio`, `analyze_audio`, `extract_audio_clip` |
| Video | `get_video_info`, `extract_video_frames`, `analyze_video_with_vision` |
| Memory | `load_user_context`, profile / facts / rules |
| Todos | `read_todos`, `add_todo`, `complete_todo`, `remove_todo` |
| Accuracy | `accuracy_rules`, `groundedness_check`, `verify_claim`, `record_correction` |
| Prompt prep | `analyze_prompt`, `preprocess_prompt` |

Each family except system can be turned off in the plugin settings for that chat.

## Requirements

- **Web / research:** network access. Private, localhost, and cloud-metadata addresses are blocked.
- **Screenshots:** macOS, plus Screen Recording permission for LM Studio. Mail, Messages, and password apps stay blocked unless you enable that option.
- **Audio / video:** [ffmpeg](https://ffmpeg.org/). Transcription uses a `whisper` CLI if you have one installed. Video describe needs a **vision-capable** model loaded in LM Studio.
- **Files:** limited to the current chat working directory.
- **Memory / todos:** stored on this machine under `~/.llm-toolbox/` (`0700` / `0600`).

Media tools accept workspace files. You can pass an exact path to an audio/video/image file when that setting is on. The plugin does not scan Voice Memos, Desktop, or Downloads.

There is no shell, browser automation, Notes, or Calendar access.

## Develop

```bash
npm install
lms dev
```

```bash
npm test
```

## License

[MIT](./LICENSE) © 2026 Andrew Ihimekpen

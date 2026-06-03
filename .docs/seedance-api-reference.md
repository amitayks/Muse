# Seedance API Reference

## Provider

**ByteDance Seed** — `https://seed.bytedance.com/en/seedance`
Contact: seed.feedback@bytedance.com

## API Access Platforms

| Platform | Audience | Base URL |
|---|---|---|
| **BytePlus ModelArk** (international) | Global developers, USD billing | `https://ark.ap-southeast.bytepluses.com/api/v3` |
| **Volcengine / Volcano Ark** (China) | Mainland China, RMB billing | `https://ark.cn-beijing.volces.com/api/v3` |

Consumer-only (no API): Jimeng (`jimeng.jianying.com`) / Dreamina (`dreamina.capcut.com`)

## Authentication

1. Sign up at `https://console.byteplus.com`
2. Get API key: `https://console.byteplus.com/ark/region:ark+ap-southeast-1/apiKey`
3. Set env var: `ARK_API_KEY=your_key`
4. Auth header: `Authorization: Bearer {API_KEY}`

## Available Models

| Model | ID | Audio | Max Duration | Max Resolution | Status |
|---|---|---|---|---|---|
| 1.0 Lite | `seedance-1-0-lite` | No | 10s | 720p | Available |
| 1.0 Pro | `seedance-1-0-pro-250528` | No | 12s | 1080p | Available |
| 1.0 Pro Fast | See docs (1901652) | No | 12s | 1080p | Available |
| **1.5 Pro** | **`seedance-1-5-pro-251215`** | **Yes** | **12s** | **1080p** | **Available (recommended)** |
| 2.0 | `doubao-seedance-2-0-pro-260215` | Yes | 15s | 2K | **NOT available via API** |

> **Seedance 2.0 API is not publicly available as of March 2026.** BytePlus confirmed the overseas API is pending company policy approval. Any third-party claiming to offer a "Seedance 2.0 API" is using unauthorized reverse-engineering of the Jimeng web app.

## Supported Modes

- **Text-to-Video**: Provide a text prompt, model generates video from scratch
- **Image-to-Video**: Provide a first-frame image + text prompt describing desired motion
- Optional: provide a **last frame** image for start-to-end transitions

Seedance does NOT support video-to-video editing or background replacement (the 2.0 model may, but its API is not available).

---

## REST API Endpoints

Base URL: `https://ark.ap-southeast.bytepluses.com/api/v3`

### Create Video Generation Task

```
POST /contents/generations/tasks
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

#### Text-to-Video

```json
{
  "model": "seedance-1-5-pro-251215",
  "content": [
    {
      "type": "text",
      "text": "Photorealistic style: A dancer performs a graceful spin in a sunlit studio --ratio 16:9 --resolution 720p --duration 5"
    }
  ]
}
```

#### Image-to-Video

```json
{
  "model": "seedance-1-5-pro-251215",
  "content": [
    {
      "type": "image_url",
      "image_url": {
        "url": "https://your-image-url.jpg"
      }
    },
    {
      "type": "text",
      "text": "A person smiling and waving at the camera --ratio 9:16 --resolution 720p --duration 5"
    }
  ]
}
```

#### Response

```json
{
  "id": "task_id_here",
  "model": "seedance-1-5-pro-251215",
  "status": "pending",
  "created_at": 1234567890
}
```

### Retrieve Task Status / Result

```
GET /contents/generations/tasks/{task_id}
Authorization: Bearer {API_KEY}
```

#### Response (completed)

```json
{
  "id": "task_id_here",
  "model": "seedance-1-5-pro-251215",
  "status": "succeeded",
  "content": {
    "video_url": "https://..."
  }
}
```

Possible statuses: `pending`, `running`, `succeeded`, `failed`

### List Tasks

```
GET /contents/generations/tasks
Authorization: Bearer {API_KEY}
```

### Cancel / Delete Task

```
DELETE /contents/generations/tasks/{task_id}
Authorization: Bearer {API_KEY}
```

---

## Prompt Parameters

Parameters are appended to the text prompt as suffixes:

| Parameter | Values | Default | Notes |
|---|---|---|---|
| `--ratio` | `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9` | `16:9` | Aspect ratio |
| `--resolution` | `480p`, `720p`, `1080p` | `720p` | Output resolution |
| `--duration` | `4`–`12` (integer, seconds) | `5` | Video length |
| `--camerafixed` | `true` / `false` | `false` | Lock camera position |
| `--sound` | `true` / `false` | `true` (1.5 Pro) | Enable/disable audio generation |

Example prompt with all parameters:
```
A cat jumping onto a table in a cozy kitchen --ratio 16:9 --resolution 1080p --duration 8 --camerafixed false --sound true
```

---

## Audio / Voice (Seedance 1.5 Pro+)

Audio is generated **natively alongside video** — no separate voice API needed.

### How it works

- **Audio is ON by default** in 1.5 Pro
- The model generates synchronized dialogue, foley effects, and ambient sound
- Lip-sync: phoneme-level precision across 8+ languages (EN, CN, JP, KR, ES, FR, DE, PT)
- Output: 48 kHz AAC embedded in MP4 (H.264)

### Dialogue generation

Include speech in quotes within the prompt:

```
A defense attorney in a courtroom declaring "Ladies and gentlemen, reasonable doubt is not a technicality" --ratio 16:9 --duration 8
```

### Voice reference

Upload a voice sample and the model generates speech matching that vocal character. Include the voice reference as an additional content item (audio_url).

### Disable audio

Append `--sound false` to the prompt for silent video output.

---

## Python SDK

### Install

```bash
pip install byteplus-python-sdk-v2
```

Requires Python 3.7+.

### Full Example: Image-to-Video

```python
import os
import time
from byteplussdkarkruntime import Ark

client = Ark(
    base_url="https://ark.ap-southeast.bytepluses.com/api/v3",
    api_key=os.environ.get("ARK_API_KEY"),
)

# Create image-to-video task
task = client.content_generation.tasks.create(
    model="seedance-1-5-pro-251215",
    content=[
        {
            "type": "image_url",
            "image_url": {"url": "https://your-image-url.jpg"}
        },
        {
            "type": "text",
            "text": "A person smiling and waving at the camera --ratio 9:16 --resolution 720p --duration 5"
        }
    ]
)

task_id = task.id
print(f"Task created: {task_id}")

# Poll for completion
while True:
    result = client.content_generation.tasks.get(task_id=task_id)
    print(f"Status: {result.status}")
    if result.status == "succeeded":
        print(f"Video URL: {result.content.video_url}")
        break
    elif result.status == "failed":
        print("Generation failed")
        break
    time.sleep(5)
```

### Full Example: Text-to-Video

```python
task = client.content_generation.tasks.create(
    model="seedance-1-5-pro-251215",
    content=[
        {
            "type": "text",
            "text": "Cinematic: A golden retriever runs through a field of wildflowers at sunset --ratio 16:9 --resolution 1080p --duration 8"
        }
    ]
)
```

### Volcengine SDK (China)

```bash
pip install volcengine-python-sdk
```

```python
from volcenginesdkarkruntime import Ark
# Same API, different base_url: https://ark.cn-beijing.volces.com/api/v3
```

---

## Node.js / TypeScript (REST)

No official Node.js SDK as of March 2026. Use the REST API directly:

```typescript
const ARK_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";
const API_KEY = process.env.ARK_API_KEY;

// Create task
async function createVideoTask(imageUrl: string, prompt: string) {
  const content: any[] = [];

  if (imageUrl) {
    content.push({
      type: "image_url",
      image_url: { url: imageUrl },
    });
  }

  content.push({
    type: "text",
    text: prompt,
  });

  const res = await fetch(`${ARK_BASE}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "seedance-1-5-pro-251215",
      content,
    }),
  });

  return res.json();
}

// Poll for result
async function pollTask(taskId: string): Promise<any> {
  while (true) {
    const res = await fetch(`${ARK_BASE}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const task = await res.json();

    if (task.status === "succeeded") return task;
    if (task.status === "failed") throw new Error("Video generation failed");

    await new Promise((r) => setTimeout(r, 5000));
  }
}
```

---

## Pricing (Seedance 1.5 Pro)

| Mode | Cost |
|---|---|
| With audio | $2.40 / million tokens |
| Without audio | $1.20 / million tokens |

**Token calculation**: `(height × width × FPS × duration) / 1024`

### Approximate costs per clip

| Resolution | Duration | Approx Cost |
|---|---|---|
| 480p | 4s | ~$0.08 |
| 720p | 5s | ~$0.26 |
| 720p | 12s | ~$0.62 |
| 1080p | 12s | ~$1.00+ |

### Seedance 1.0 Pro

$2.50 / million tokens (both text-to-video and image-to-video)

---

## Rate Limits

| Limit | Value |
|---|---|
| Max concurrent requests | 10 per account |
| Requests per minute | 600 RPM |

### Rate limit headers

- `X-RateLimit-Limit` — total requests allowed
- `X-RateLimit-Remaining` — requests remaining
- `X-RateLimit-Reset` — UNIX timestamp for quota reset
- HTTP 429 returned with `Retry-After` header when exceeded

---

## Video Output Specs by Model

| Spec | 1.0 Lite | 1.0 Pro | 1.5 Pro | 2.0 (not avail) |
|---|---|---|---|---|
| Resolution | 480p, 720p | 480p–1080p | 480p–1080p | Up to 2K |
| Duration | 5s, 10s | 2–12s | 4–12s | 4–15s |
| Frame rate | 24 fps | 24 fps | 24 fps | 24 fps |
| Aspect ratios | 16:9, 9:16, 1:1 | +4:3, 3:4, 21:9 | +4:3, 3:4, 21:9 | +4:3, 3:4, 21:9 |
| Native audio | No | No | Yes | Yes |
| Output format | MP4 | MP4 | MP4 (H.264+AAC) | MP4 (H.264+AAC) |

---

## Prompt Guide (Seedance 1.5 Pro)

Official prompt guide: `https://docs.byteplus.com/en/docs/ModelArk/2168087`

### Tips

- Lead with style: `"Photorealistic style:"`, `"Cinematic:"`, `"Anime style:"`
- Be specific about motion: "walks slowly toward the camera" > "moves"
- For dialogue: put exact speech in quotes within the prompt
- For ambient sound: describe the environment ("busy cafe", "rain on a window")
- Use `--camerafixed true` for talking-head / static camera shots
- Keep prompts concise but descriptive — the model responds well to clear direction

---

## Official Documentation Links

- Seedance product page: `https://seed.bytedance.com/en/seedance`
- BytePlus Video Generation API: `https://docs.byteplus.com/en/docs/ModelArk/Video_Generation_API`
- Create video task: `https://docs.byteplus.com/en/docs/ModelArk/1520757`
- Retrieve video task: `https://docs.byteplus.com/en/docs/ModelArk/1521309`
- Seedance 1.5 Pro prompt guide: `https://docs.byteplus.com/en/docs/ModelArk/2168087`
- Seedance 1.0 Pro model page: `https://docs.byteplus.com/en/docs/ModelArk/1587798`
- Python SDK install: `https://docs.byteplus.com/en/docs/ModelArk/1319847`
- Python SDK GitHub: `https://github.com/byteplus-sdk/byteplus-python-sdk-v2`
- Pricing: `https://docs.byteplus.com/en/docs/ModelArk/1544106`
- Technical paper (arxiv): `https://arxiv.org/pdf/2506.09113`

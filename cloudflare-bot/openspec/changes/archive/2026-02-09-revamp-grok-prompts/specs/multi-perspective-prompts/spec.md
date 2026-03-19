## ADDED Requirements

### Requirement: Multi-perspective system prompt for content generation
The system prompt for `generateContent()` SHALL instruct Grok to think from multiple expert perspectives before generating tweets and image prompts. The prompt SHALL NOT assign Grok a single role ("you are a developer advocate") but instead ask it to consider what each expert would prioritize.

#### Scenario: System prompt references tweet perspectives
- **WHEN** the system prompt is sent to Grok for content generation
- **THEN** it includes instructions to think from the perspectives of at least: Tech Influencer (engagement hooks), Copywriter (word impact within 280 chars), Growth Marketer (shareability), and Community Manager (dev community resonance)

#### Scenario: System prompt references image perspectives
- **WHEN** the system prompt is sent to Grok for content generation
- **THEN** it includes instructions to think from the perspectives of at least: Creative Director (visual story), Art Director (emotional impact), and Brand Designer (visual identity consistency)

### Requirement: Perspective-based prompting pattern
The system prompt SHALL use the pattern "Think from the perspective of X — what would they prioritize?" rather than "You are X". It SHALL ask Grok to synthesize insights from all perspectives into its final output.

#### Scenario: Prompt uses perspective framing
- **WHEN** the system prompt text is examined
- **THEN** it uses language like "think from the perspective of" or "what would a [role] prioritize" rather than "you are a [role]"

#### Scenario: Prompt asks for synthesis
- **WHEN** the system prompt text is examined
- **THEN** it explicitly asks Grok to synthesize the multiple perspectives into one cohesive output

### Requirement: Unified prompt for tweets and image
The system prompt SHALL handle both tweet generation and image prompt generation in a single unified prompt. It SHALL frame the task as creating a complete social media package (content + visual) for a code change.

#### Scenario: Single API call produces both outputs
- **WHEN** `generateContent()` is called
- **THEN** a single Grok API call returns both the tweets array and the structured imagePrompt

### Requirement: Edit prompt uses same creative approach
The `editContent()` system prompt SHALL use the same multi-perspective creative approach as the generation prompt, adapted for the editing context.

#### Scenario: Edit prompt includes perspective thinking
- **WHEN** `editContent()` sends a system prompt to Grok
- **THEN** it includes multi-perspective instructions for refining both tweets and image prompt

### Requirement: Response format is strict JSON
The system prompt SHALL instruct Grok to respond ONLY with valid JSON containing `format` (single/thread), `tweets` (array of {text, index}), and `imagePrompt` (ImagePromptData object). No prose, no markdown, no explanation outside the JSON.

#### Scenario: Valid JSON response with structured imagePrompt
- **WHEN** Grok responds to the content generation prompt
- **THEN** the response is valid JSON with `format`, `tweets`, and `imagePrompt` (as ImagePromptData object)

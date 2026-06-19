/**
 * /image-gen skill — the image-prompt-builder methodology.
 *
 * Standalone, identity-attached skill: invoked on its own (not appended to a
 * content skill) to turn a tweet (+ source context) into a single JSON image
 * prompt that is sent to the image model as-is. Identity supplies the voice;
 * this skill supplies the structure. Maintained in English only — the attached
 * identity and the tweet carry language and personal taste. Hebrew lookups fall
 * back to this English content via getPrompt().
 */
export const IMAGE_GEN = `# Image Prompt Builder

Generate professional, highly detailed image generation prompts from simple user requests. This skill transforms casual descriptions into structured, comprehensive prompts that maximize quality and control in AI image generation.

## Core Methodology

### The Expansion Process

Transform user requests through systematic elaboration:

1. **Parse Intent**: Extract the core visual concept from user's request
2. **Identify Gaps**: Note missing details that need specification
3. **Apply Structure**: Organize into the five core categories
4. **Enrich Details**: Add professional-grade specificity to each element
5. **Format Output**: Present as structured JSON for clarity

### The Five-Category Framework

Every professional image prompt should address:

1. **Subject Parameters** - Who/what is the focus
2. **Apparel & Styling** - Clothing, accessories, styling details
3. **Pose & Action** - Body position, gesture, movement, expression
4. **Environment & Props** - Setting, background, objects, atmosphere
5. **Technical Specifications** - Camera angle, lighting, medium, style

## Building Each Category

### 1. Subject Parameters

**What to specify:**
- Physical identity (preserve reference if given, or describe features)
- Hair (length, color, style, texture)
- Facial expression (emotion, gaze direction)
- Body type/build (when relevant)
- Age/demographic markers (when relevant)
- Distinctive features (tattoos, scars, accessories)

**Detail level:**
- Generic: "long hair"
- Professional: "Long, ash-brown, textured wolf cut with side-swept layers"

### 2. Apparel & Styling

**What to specify:**
- Top (style, color, material, fit, distinctive features)
- Bottom (type, color, wash/distressing, details)
- Footwear (brand/style when recognizable, colors)
- Accessories (jewelry, bags, hats, etc.)
- Styling notes (vintage, modern, distressed, pristine)

**Detail level:**
- Generic: "black hoodie and shorts"
- Professional: "Sleeveless cropped black hoodie with high collar, faded black denim shorts with vintage distressed style and raw hem with frayed fibers"

### 3. Pose & Action

**What to specify:**
- Primary body position (standing, sitting, lying, etc.)
- Limb positions (arms, legs, specific placement)
- Gesture or action (holding object, reaching, smoking, etc.)
- Expression and gaze (where they're looking, emotion)
- Dynamic vs static quality

**Detail level:**
- Generic: "sitting in car"
- Professional: "Lying relaxed inside an open car trunk, legs bent and crossed, right arm stretched upward, left hand holding a lit cigarette near mouth"

### 4. Environment & Props

**What to specify:**
- Primary location/setting
- Immediate surroundings (what's directly around subject)
- Background elements (distant objects, sky, structures)
- Props and objects (what they're interacting with)
- Atmosphere (mood, time of day, weather)
- Spatial relationships (what's left/right/behind)

**Detail level:**
- Generic: "nighttime outdoors"
- Professional: "Trunk of bright yellow sports car containing transparent box and yellow bottle, dark outdoor nighttime setting with faint building silhouette, partial wheel of another vehicle on left"

### 5. Technical Specifications

**What to specify:**
- Camera angle (high-angle, low-angle, eye-level, Dutch tilt)
- Lighting type (natural, flash, studio, ambient)
- Lighting quality (hard, soft, directional, diffused)
- Medium/style (film, digital, analog, illustration style)
- Film stock/texture (35mm, grainy, clean, vintage)
- Atmosphere/mood (edgy, dreamy, clinical, warm)
- Color grading (if specific palette desired)

**Detail level:**
- Generic: "photo with flash"
- Professional: "High-angle shot looking down, hard direct flash with 35mm analog style, grainy film texture, dark ambient background, edgy and mysterious atmosphere"

## Professional Vocabulary Guide

### Camera Angles
- **High-angle**: Looking down at subject (creates vulnerability/intimacy)
- **Low-angle**: Looking up at subject (creates power/dominance)
- **Eye-level**: Straight on (neutral, documentary)
- **Dutch tilt**: Canted angle (dynamic, unsettling)
- **Over-the-shoulder**: From behind subject's shoulder
- **Bird's eye**: Directly overhead

### Lighting Types
- **Hard light**: Direct, creates sharp shadows (flash, direct sun)
- **Soft light**: Diffused, minimal shadows (overcast, softbox)
- **Rim/edge lighting**: Light from behind, outlines subject
- **Rembrandt lighting**: Triangle of light under eye
- **Split lighting**: Half lit, half shadow
- **Butterfly lighting**: Light from above, shadow under nose

### Film/Medium Styles
- **35mm film**: Grain, warmth, analog feel
- **Medium format**: High detail, professional quality
- **Instant film**: Polaroid aesthetic, vintage colors
- **Digital cinema**: Clean, high dynamic range
- **Film noir**: High contrast, dramatic shadows
- **Cinematic**: Wide aspect, color grading

## Workflow

### Step 1: Extract Core Elements
From user request, identify:
- Main subject
- Basic action/pose
- Setting/environment
- Any specific requirements

### Step 2: Expand Each Category
Using the five-category framework, add professional-level detail to each element.

### Step 3: Structure Output
Format as JSON with clear hierarchy:

{
  "prompt_breakdown": {
    "subject_parameters": { ... },
    "apparel": { ... },
    "pose_and_action": { ... },
    "environment_and_props": { ... },
    "technical_specs": { ... }
  }
}

### Step 4: Review for Completeness
Ensure every category has sufficient detail. No generic descriptions.

## Output Format

Always present the final prompt as structured JSON following this template:

{
  "prompt_breakdown": {
    "subject_parameters": {
      "[key_aspect]": "[detailed description]"
    },
    "apparel": {
      "top": "[detailed description]",
      "bottom": "[detailed description]",
      "footwear": "[detailed description]",
      "accessories": "[if applicable]"
    },
    "pose_and_action": {
      "body_position": "[detailed description]",
      "arms": "[detailed description]",
      "legs": "[if relevant]",
      "action": "[detailed description]"
    },
    "environment_and_props": {
      "primary_location": "[detailed description]",
      "immediate_surroundings": "[detailed description]",
      "background": "[detailed description]",
      "props": "[if applicable]"
    },
    "technical_specs": {
      "angle": "[camera angle description]",
      "lighting": "[lighting setup description]",
      "medium": "[medium/style description]",
      "atmosphere": "[mood keywords]"
    }
  }
}

Output the JSON object only — no prose, no preamble, no code fences.

## Quality Checklist

Before delivering, verify:
- All five categories addressed
- No generic terms (replace "nice", "good", "casual" with specifics)
- Measurable details (not "long" but "shoulder-length")
- Professional photography vocabulary used
- Brand names included when recognizable items specified
- Color specified with nuance (not "blue" but "navy" or "cobalt")
- Material/texture specified (denim, leather, silk, etc.)
- Spatial relationships clear (left, right, foreground, background)`;

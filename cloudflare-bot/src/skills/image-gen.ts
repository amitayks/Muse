/**
 * /image-gen skill — the "how, not what" image skill.
 *
 * Standalone, identity-attached skill: invoked on its own (not appended to a
 * content skill) to turn a tweet (+ source context) into a single JSON image
 * prompt that is sent to the image model as-is. It instructs the model on HOW
 * to make an image that accompanies a specific tweet — it never prescribes WHAT
 * to create or imposes a genre/style. Subject and look are the model's choice;
 * the attached identity supplies taste. Written first-person, consistent with
 * the other skills. Maintained in English only — the attached identity and the
 * tweet carry language and personal taste. Hebrew lookups fall back to this
 * English content via getPrompt().
 */
export const IMAGE_GEN = `# Image Prompt Builder

I'm making an image to ride alongside one specific post of mine — this exact tweet in the thread, not the thread as a whole. Whatever I make has to earn its place next to these words: add something the text alone can't, catch the eye, make someone slow down mid-scroll.

So I start from what this post is actually saying, and I ask what single visual idea would make that point land harder. I'm not illustrating the words literally and I'm not dropping the text into a picture — I'm choosing an image that complements and sharpens what I'm saying.

I have complete freedom in what I make. There's no house style I owe anything to, no genre I have to fit, no kind of shot I'm supposed to produce. A scene, an object, an abstraction, a mood, a diagram, something playful or strange — whatever serves this post best is mine to choose. I decide the subject. I decide the look.

The one thing I won't be is vague. A wishy-washy idea renders as a muddy, forgettable image. Once I know what I want, I describe it concretely and specifically — enough detail that it comes out as one clear, intentional image with an obvious focal point that still reads at a glance in a feed.

---
I output a single JSON object describing the image I want. I choose whatever fields best capture my vision — there is no fixed schema to fill in. JSON only — no prose, no preamble, no code fences.`;

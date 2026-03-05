export { WHO_AM_I_EN, WHO_AM_I_HE } from './who-am-i';
export { WORK_PROGRESS_EN, WORK_PROGRESS_HE } from './work-progress';
export { REFINE_EN, REFINE_HE } from './refine';
export { QUOTE_EN, QUOTE_HE } from './quote';
export { VIDEO_EN, VIDEO_HE } from './video';
export { KNOW_MY_PROJECT_EN, KNOW_MY_PROJECT_HE } from './know-my-project';
export { PERSONA_EN, PERSONA_HE } from './persona';
export { WHAT_I_LIKE_EN, WHAT_I_LIKE_HE } from './what-i-like';
export { IMAGE_GEN_EN, IMAGE_GEN_HE } from './image-gen';

import { WHO_AM_I_EN, WHO_AM_I_HE } from './who-am-i';
import { WORK_PROGRESS_EN, WORK_PROGRESS_HE } from './work-progress';
import { REFINE_EN, REFINE_HE } from './refine';
import { QUOTE_EN, QUOTE_HE } from './quote';
import { VIDEO_EN, VIDEO_HE } from './video';
import { KNOW_MY_PROJECT_EN, KNOW_MY_PROJECT_HE } from './know-my-project';
import { PERSONA_EN, PERSONA_HE } from './persona';
import { WHAT_I_LIKE_EN, WHAT_I_LIKE_HE } from './what-i-like';
import { IMAGE_GEN_EN, IMAGE_GEN_HE } from './image-gen';

type PromptType = 'work-progress' | 'refine' | 'quote' | 'video' | 'know-my-project' | 'persona' | 'what-i-like' | 'who-am-i' | 'image-gen';

export function getDefaultPromptTexts(): Array<{ type: PromptType; language: string; content: string }> {
    return [
        { type: 'who-am-i', language: 'en', content: WHO_AM_I_EN },
        { type: 'work-progress', language: 'en', content: WORK_PROGRESS_EN },
        { type: 'refine', language: 'en', content: REFINE_EN },
        { type: 'quote', language: 'en', content: QUOTE_EN },
        { type: 'video', language: 'en', content: VIDEO_EN },
        { type: 'know-my-project', language: 'en', content: KNOW_MY_PROJECT_EN },
        { type: 'persona', language: 'en', content: PERSONA_EN },
        { type: 'what-i-like', language: 'en', content: WHAT_I_LIKE_EN },
        { type: 'image-gen', language: 'en', content: IMAGE_GEN_EN },
        { type: 'who-am-i', language: 'he', content: WHO_AM_I_HE },
        { type: 'work-progress', language: 'he', content: WORK_PROGRESS_HE },
        { type: 'refine', language: 'he', content: REFINE_HE },
        { type: 'quote', language: 'he', content: QUOTE_HE },
        { type: 'video', language: 'he', content: VIDEO_HE },
        { type: 'know-my-project', language: 'he', content: KNOW_MY_PROJECT_HE },
        { type: 'persona', language: 'he', content: PERSONA_HE },
        { type: 'what-i-like', language: 'he', content: WHAT_I_LIKE_HE },
        { type: 'image-gen', language: 'he', content: IMAGE_GEN_HE },
    ];
}

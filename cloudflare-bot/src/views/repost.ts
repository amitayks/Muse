/**
 * Repost views — prompt
 */

import type { ViewResult } from '../types';
import { t } from '../ui/strings';
import type { Lang } from '../ui/strings';
import { cancelRow } from '../ui/components';

export function renderRepostPrompt(lang: Lang = 'en'): ViewResult {
    return {
        text: `${t(lang, 'repost.promptTitle')}

${t(lang, 'repost.promptDesc')}

${t(lang, 'repost.supportedFormats')}
<code>https://x.com/username/status/123456</code>
<code>https://twitter.com/username/status/123456</code>

${t(lang, 'repost.promptHint')}`,
        keyboard: [cancelRow('view:home', lang)],
    };
}

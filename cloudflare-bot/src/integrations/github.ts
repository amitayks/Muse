/**
 * GitHub Service - Fetch commit and PR data across all owner repos
 */

import type { Env, PRData, CommitData, ContentSource } from '../types';

const GITHUB_API = 'https://api.github.com';

interface GitHubCommit {
    sha: string;
    commit: {
        message: string;
        author: { name: string; date: string };
    };
    repository?: {
        full_name: string;
    };
}

// Extended commit response with stats (from single commit endpoint)
interface GitHubCommitWithStats extends GitHubCommit {
    stats?: {
        additions: number;
        deletions: number;
        total: number;
    };
    files?: { filename: string }[];
    author?: { login: string } | null;
}

interface GitHubPR {
    number: number;
    title: string;
    body: string;
    merged_at: string;
    user: { login: string };
    additions: number;
    deletions: number;
    changed_files: number;
}

interface CommitSearchResult {
    total_count: number;
    items: Array<{
        sha: string;
        repository: {
            full_name: string;
        };
        commit: {
            message: string;
            author: { name: string; date: string };
        };
        author?: { login: string } | null;
    }>;
}

/**
 * Make authenticated GitHub API request
 */
async function githubFetch<T>(env: Env, path: string): Promise<T> {
    const response = await fetch(`${GITHUB_API}${path}`, {
        headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'content-bot',
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error ${response.status}: ${error}`);
    }

    return response.json() as Promise<T>;
}

/** Custom error for missing GitHub token */
export class GitHubTokenMissingError extends Error {
    constructor() {
        super('GitHub token not configured');
        this.name = 'GitHubTokenMissingError';
    }
}

/**
 * Search user's recent push events for a commit SHA.
 * Works for any branch and fork — not subject to search indexing limitations.
 * Note: only finds commits pushed by the user themselves (not by bots/apps).
 */
async function findCommitInEvents(env: Env, sha: string): Promise<string | null> {
    if (!env.GITHUB_OWNER) return null;

    try {
        for (let page = 1; page <= 3; page++) {
            const events = await githubFetch<Array<{
                type: string;
                repo: { name: string };
                payload: { commits?: Array<{ sha: string }> };
            }>>(env, `/users/${env.GITHUB_OWNER}/events?per_page=100&page=${page}`);

            if (events.length === 0) break;

            for (const event of events) {
                if (event.type !== 'PushEvent' || !event.payload.commits) continue;
                for (const commit of event.payload.commits) {
                    if (commit.sha.startsWith(sha) || sha.startsWith(commit.sha)) {
                        return event.repo.name;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Events API error:', error);
    }

    return null;
}

/**
 * Search user's repos by trying direct commit lookup on each.
 * Most reliable fallback — works for any branch, fork, and regardless of who pushed.
 */
async function findCommitInRepos(env: Env, sha: string): Promise<string | null> {
    if (!env.GITHUB_OWNER) return null;

    try {
        const repos = await githubFetch<Array<{ full_name: string }>>(
            env,
            `/users/${env.GITHUB_OWNER}/repos?type=all&sort=pushed&per_page=30`
        );
        console.log(`[repoScan] checking ${repos.length} repos for ${sha.substring(0, 7)}`);

        for (const repo of repos) {
            const response = await fetch(`${GITHUB_API}/repos/${repo.full_name}/commits/${sha}`, {
                headers: {
                    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'content-bot',
                },
            });

            if (response.ok) {
                console.log(`[repoScan] FOUND in ${repo.full_name}`);
                return repo.full_name;
            }
        }
    } catch (error) {
        console.error('Repo scan error:', error);
    }

    return null;
}

/**
 * Search for a commit by SHA across the user's accessible repos.
 * Strategy: Search API → Events API → Repo scan (direct commit lookup on each repo).
 */
async function findCommitBysha(env: Env, sha: string): Promise<{ repo: string; commit: CommitSearchResult['items'][0] } | null> {
    if (!env.GITHUB_TOKEN) {
        throw new GitHubTokenMissingError();
    }

    try {
        // If GITHUB_OWNER is set, search scoped to that owner
        if (env.GITHUB_OWNER) {
            // Strategy 1: Search API (fast, works for default branch on non-fork repos)
            const searchResult = await githubFetch<CommitSearchResult>(
                env,
                `/search/commits?q=hash:${sha}+author:${env.GITHUB_OWNER}`
            );

            if (searchResult.items.length > 0) {
                return {
                    repo: searchResult.items[0].repository.full_name,
                    commit: searchResult.items[0],
                };
            }

            const broaderSearch = await githubFetch<CommitSearchResult>(
                env,
                `/search/commits?q=hash:${sha}+user:${env.GITHUB_OWNER}`
            );

            if (broaderSearch.items.length > 0) {
                return {
                    repo: broaderSearch.items[0].repository.full_name,
                    commit: broaderSearch.items[0],
                };
            }

            // Strategy 2: Events API → Repo scan (forks + non-default branches)
            const matchedRepo = await findCommitInEvents(env, sha) || await findCommitInRepos(env, sha);
            if (matchedRepo) {
                const commit = await getCommit(env, matchedRepo, sha);
                return {
                    repo: matchedRepo,
                    commit: {
                        sha: commit.sha,
                        repository: { full_name: matchedRepo },
                        commit: commit.commit,
                        author: commit.author,
                    },
                };
            }
        }

        // No GITHUB_OWNER set — cannot scope search, return null rather than risk
        // returning commits from other users' public repos.
        return null;
    } catch (error) {
        if (error instanceof GitHubTokenMissingError) throw error;
        console.error('Commit search error:', error);
        return null;
    }
}

/**
 * Get commit details from a specific repo
 */
export async function getCommit(env: Env, repo: string, sha: string): Promise<GitHubCommitWithStats> {
    return githubFetch<GitHubCommitWithStats>(env, `/repos/${repo}/commits/${sha}`);
}

/**
 * Find the PR that contains a specific commit (repo must already be known)
 */
async function findPRForCommit(env: Env, repo: string, sha: string): Promise<PRData | null> {
    try {
        const prs = await githubFetch<{ number: number; merged_at: string | null }[]>(
            env,
            `/repos/${repo}/commits/${sha}/pulls`
        );

        const mergedPRs = prs.filter(pr => pr.merged_at !== null);

        if (mergedPRs.length === 0) {
            const searchResult = await githubFetch<{ items: { number: number }[] }>(
                env,
                `/search/issues?q=repo:${repo}+is:pr+is:merged+${sha}`
            );

            if (!searchResult.items || searchResult.items.length === 0) {
                return null;
            }

            return getPR(env, repo, searchResult.items[0].number);
        }

        return getPR(env, repo, mergedPRs[0].number);
    } catch (error) {
        console.error('PR lookup error:', error);
        return null;
    }
}

/**
 * Get PR details with stats, commit messages, and file names
 */
export async function getPR(env: Env, repo: string, number: number): Promise<PRData> {
    const pr = await githubFetch<GitHubPR>(env, `/repos/${repo}/pulls/${number}`);

    // Get commits in this PR (includes commit messages)
    const commits = await githubFetch<GitHubCommit[]>(
        env,
        `/repos/${repo}/pulls/${number}/commits`
    );

    // Get changed files in this PR
    const files = await githubFetch<{ filename: string }[]>(
        env,
        `/repos/${repo}/pulls/${number}/files`
    );

    return {
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        commits: commits.map((c) => c.sha),
        // Full message of each commit (subject + body), not just the first line.
        commitMessages: commits.map((c) => c.commit.message),
        fileNames: files.map((f) => f.filename),
        files_changed: pr.changed_files,
        additions: pr.additions,
        deletions: pr.deletions,
        merged_at: pr.merged_at,
        author: pr.user.login,
    };
}

/**
 * Get commit data with stats (repo must already be known)
 */
async function buildCommitData(env: Env, repo: string, sha: string, searchAuthor?: string | null): Promise<CommitData> {
    const commit = await getCommit(env, repo, sha);
    const [title, ...bodyLines] = commit.commit.message.split('\n');

    return {
        sha: commit.sha,
        title: title || 'Untitled commit',
        body: bodyLines.join('\n').trim(),
        // Full commit message (subject + body) — used by the content prompt.
        commitMessages: [commit.commit.message.trim() || title || 'Untitled commit'],
        fileNames: commit.files?.map(f => f.filename) || [],
        files_changed: commit.files?.length || 0,
        additions: commit.stats?.additions || 0,
        deletions: commit.stats?.deletions || 0,
        author: commit.author?.login || searchAuthor || commit.commit.author.name,
        date: commit.commit.author.date,
    };
}

/**
 * Get content source for a manually-pasted SHA.
 *
 * Default (`preferPr` false): resolves to exactly that one commit — we do NOT
 * expand it to the PR that contains it.
 *
 * PR opt-in (`preferPr` true): resolves the PR that contains the commit and
 * returns all of its commits; falls back to single-commit if no PR is found.
 *
 * (The GitHub webhook handler builds PR sources separately via getPR().)
 */
export async function getContentSource(env: Env, sha: string, preferPr = false): Promise<ContentSource> {
    // Step 1: Find which repo has this commit (single lookup)
    const found = await findCommitBysha(env, sha);
    if (!found) {
        throw new Error(`Commit ${sha} not found in any accessible repo`);
    }

    const { repo, commit: searchCommit } = found;

    // Step 2 (opt-in): expand to the PR that contains this commit.
    if (preferPr) {
        const pr = await findPRForCommit(env, repo, sha);
        if (pr) {
            console.log(`PR mode: found PR #${pr.number} in repo ${repo}`);
            return { type: 'pr', data: pr, repo };
        }
        console.log('PR mode requested but no PR found — falling back to single commit');
    }

    // Step 3: Single-commit data (default, and the PR-mode fallback).
    const commitData = await buildCommitData(env, repo, sha, searchCommit.author?.login);
    return { type: 'commit', data: commitData, repo };
}

// ==================== OVERVIEW BOOTSTRAP ====================

interface GitHubReadmeResponse {
    content: string;
    encoding: string;
}

export interface PRSummary {
    number: number;
    title: string;
    body: string;
    merged_at: string;
}

/**
 * Fetch repo README content via GitHub API
 * Returns decoded text or null if no README
 */
export async function fetchRepoReadme(env: Env, owner: string, repo: string): Promise<string | null> {
    try {
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/readme`, {
            headers: {
                Authorization: `Bearer ${env.GITHUB_TOKEN}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'content-bot',
            },
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            return null;
        }

        const data = await response.json() as GitHubReadmeResponse;
        if (data.encoding === 'base64' && data.content) {
            // Decode base64 content
            const decoded = atob(data.content.replace(/\n/g, ''));
            return decoded;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Fetch recent merged PRs for a repo
 */
export async function fetchRecentMergedPRs(
    env: Env,
    owner: string,
    repo: string,
    count: number = 10
): Promise<PRSummary[]> {
    try {
        const prs = await githubFetch<Array<{
            number: number;
            title: string;
            body: string | null;
            merged_at: string | null;
        }>>(
            env,
            `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${count}`
        );

        return prs
            .filter(pr => pr.merged_at !== null)
            .map(pr => ({
                number: pr.number,
                title: pr.title,
                body: pr.body || '',
                merged_at: pr.merged_at!,
            }));
    } catch {
        return [];
    }
}

export interface RepoSearchResult {
    full_name: string;
    description: string | null;
    private: boolean;
}

/**
 * Search the owner's accessible repositories by a free-text query.
 *
 * Scoped to GITHUB_OWNER via the global GITHUB_TOKEN (same scoping as commit
 * search). Uses GitHub's /search/repositories with `user:OWNER`, falling back
 * to listing the owner's repos and filtering client-side if search fails or is
 * rate-limited. Returns at most 20 results.
 *
 * Empty/whitespace queries return an empty result set (callers should also
 * short-circuit, but this keeps the function safe).
 */
export async function searchOwnerRepos(env: Env, query: string): Promise<RepoSearchResult[]> {
    if (!env.GITHUB_TOKEN) {
        throw new GitHubTokenMissingError();
    }
    const owner = env.GITHUB_OWNER;
    if (!owner) return [];

    const q = query.trim();
    if (!q) return [];

    // Strategy 1: GitHub search API scoped to the owner.
    try {
        const search = await githubFetch<{
            items: Array<{ full_name: string; description: string | null; private: boolean }>;
        }>(
            env,
            `/search/repositories?q=${encodeURIComponent(`${q} user:${owner} fork:true`)}&per_page=20`,
        );
        if (search.items && search.items.length > 0) {
            return search.items.map((r) => ({
                full_name: r.full_name,
                description: r.description ?? null,
                private: !!r.private,
            }));
        }
    } catch (error) {
        console.error('[repoSearch] search API error:', error);
    }

    // Strategy 2: list the owner's repos (sorted by recent activity) and filter.
    try {
        const repos = await githubFetch<Array<{
            full_name: string;
            name: string;
            description: string | null;
            private: boolean;
        }>>(
            env,
            `/users/${owner}/repos?type=all&sort=pushed&per_page=100`,
        );
        const lower = q.toLowerCase();
        return repos
            .filter((r) =>
                r.name.toLowerCase().includes(lower) ||
                r.full_name.toLowerCase().includes(lower) ||
                (r.description || '').toLowerCase().includes(lower),
            )
            .slice(0, 20)
            .map((r) => ({
                full_name: r.full_name,
                description: r.description ?? null,
                private: !!r.private,
            }));
    } catch (error) {
        console.error('[repoSearch] repo list error:', error);
        return [];
    }
}

/**
 * Validate that a repository exists and is accessible.
 * Returns the canonical owner/name from GitHub, or null on failure.
 */
export async function validateRepo(
    env: Env,
    owner: string,
    repo: string
): Promise<{ owner: string; name: string; default_branch: string } | null> {
    try {
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
            headers: {
                Authorization: `token ${env.GITHUB_TOKEN}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'content-bot',
            },
        });

        if (response.ok) {
            const data = await response.json() as { owner: { login: string }; name: string; default_branch: string };
            console.log(`Repository ${data.owner.login}/${data.name} is valid and accessible`);
            // default_branch lets callers seed the initial watched branch with the repo's
            // real default (master/trunk/develop/…) instead of assuming 'main'.
            return { owner: data.owner.login, name: data.name, default_branch: data.default_branch };
        }

        if (response.status === 404) {
            console.log(`Repository ${owner}/${repo} not found`);
            return null;
        }

        console.log(`Failed to validate ${owner}/${repo}: ${response.status}`);
        return null;
    } catch (error) {
        console.error(`Error validating repo ${owner}/${repo}:`, error);
        return null;
    }
}

/**
 * Verify a branch exists on a repository before it is followed.
 *
 * Uses the caller-provided env's GITHUB_TOKEN — pass a hydrateEnv()'d env so this
 * authenticates with the user's GitHub token (this project has no worker-level token).
 * Returns the canonical branch name (case-preserving, exactly as GitHub reports it) on
 * success, or `null` when the branch does not exist (HTTP 404). Any other failure throws
 * a generic error so callers can distinguish "not found" (reject) from "couldn't check"
 * (server error). SECURITY: the token is never included in thrown/logged messages.
 *
 * Git branch names are case-sensitive and the webhook handler matches them exactly, so we
 * store GitHub's canonical `name` rather than the user's typed casing.
 */
export async function validateBranch(
    env: Env,
    owner: string,
    repo: string,
    branch: string
): Promise<string | null> {
    // Branch names can contain '/', e.g. release/1.0. Encode each segment but keep the
    // slashes so GitHub matches the full ref (encodeURIComponent alone would escape '/').
    const encodedBranch = branch.split('/').map(encodeURIComponent).join('/');
    try {
        const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/branches/${encodedBranch}`, {
            headers: {
                Authorization: `token ${env.GITHUB_TOKEN}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'content-bot',
            },
        });

        if (response.ok) {
            const data = await response.json() as { name: string };
            return data.name;
        }

        if (response.status === 404) {
            return null;
        }

        // Non-404 failure — log status only (no token, no body) and surface a generic error.
        console.error(`[validateBranch] ${owner}/${repo} branch check failed: ${response.status}`);
        throw new Error('Failed to verify branch');
    } catch (error) {
        if (error instanceof Error && error.message === 'Failed to verify branch') throw error;
        console.error(`Error verifying branch ${owner}/${repo}#${branch}:`, error);
        throw new Error('Failed to verify branch');
    }
}


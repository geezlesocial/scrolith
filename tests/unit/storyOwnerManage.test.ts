/**
 * Story owner manage: 3-dot menu, My Posts story cards, z-index above viewer.
 * Run: node --import tsx --test tests/unit/storyOwnerManage.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const storyViewer = readFileSync(join(root, 'src/features/stories/components/StoryViewer.tsx'), 'utf8');
const myPosts = readFileSync(join(root, 'src/dashboard/shared/MyPosts.tsx'), 'utf8');
const memberHome = readFileSync(join(root, 'src/components/sections/MemberHomeSection.tsx'), 'utf8');
const community = readFileSync(join(root, 'src/services/community.ts'), 'utf8');

test('StoryViewer exposes owner menu with edit, update media, delete', () => {
  assert.match(storyViewer, /data-testid="story-owner-menu"/);
  assert.match(storyViewer, /data-testid="story-menu-edit"/);
  assert.match(storyViewer, /data-testid="story-menu-update"/);
  assert.match(storyViewer, /data-testid="story-menu-delete"/);
  assert.match(storyViewer, /onUpdate\?:/);
  assert.match(storyViewer, /viewerOwnsStory/);
  assert.match(storyViewer, /actionsOpen/);
});

test('Member Home story edit modal sits above StoryViewer z-index', () => {
  assert.match(memberHome, /z-\[1000\]/);
  assert.match(memberHome, /data-testid="story-edit-modal"/);
  assert.match(memberHome, /author\?\.id/);
  assert.match(memberHome, /onUpdate=\{\(\) => openStoryEditor/);
  assert.match(memberHome, /story-edit-media-input/);
  assert.match(memberHome, /community:story_updated/);
  assert.match(memberHome, /community:story_deleted/);
});

test('My Posts includes Story cards and management', () => {
  assert.match(myPosts, /data-testid="my-posts-story-card"/);
  assert.match(myPosts, /getMyStories/);
  assert.match(myPosts, /kindFilter.*stories|stories.*Stories/);
  assert.match(myPosts, /beginStoryEdit|saveStoryEdit|confirmDeleteStory/);
  assert.match(myPosts, /Update media|Update/);
  assert.match(myPosts, /deleteStoryId/);
});

test('CommunityService.getMyStories exists', () => {
  assert.match(community, /static async getMyStories/);
});

export enum PostStatus {
  Draft = 'draft',
  Published = 'published',
}

export const BLOG_LIMITS = {
  titleLength: 100,
  bodyLength: 10000,
  tagCount: 5,
  tagLength: 30,
  commentLength: 500,
  defaultPage: 1,
  defaultPageSize: 10,
  maxPageSize: 100,
  searchLength: 100,
  excerptLength: 200,
} as const;

export const DEFAULT_POST_STATUS = PostStatus.Draft;

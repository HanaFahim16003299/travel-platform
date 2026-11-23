export enum PostStatus {
  Draft = 'draft',
  Published = 'published',
}

export enum ReportTargetType {
  Post = 'post',
  Comment = 'comment',
}

export enum ReportStatus {
  Pending = 'pending',
  Dismissed = 'dismissed',
  ContentHidden = 'content_hidden',
  ContentDeleted = 'content_deleted',
}

export enum ReportAction {
  Dismiss = 'dismiss',
  Hide = 'hide',
  Delete = 'delete',
}

export const BLOG_LIMITS = {
  titleLength: 100,
  bodyLength: 10000,
  tagCount: 5,
  tagLength: 30,
  commentLength: 500,
  reportReasonLength: 500,
  adminNoteLength: 500,
  imagesPerPost: 5,
  defaultPage: 1,
  defaultPageSize: 10,
  maxPageSize: 100,
  searchLength: 100,
  excerptLength: 200,
} as const;

export const DEFAULT_POST_STATUS = PostStatus.Draft;

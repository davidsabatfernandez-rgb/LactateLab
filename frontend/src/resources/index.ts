export { type ArticleSection, type ArticleContent } from "./articles";
import { ARTICLE_CONTENT } from "./articles";
import { ARTICLE_CONTENT_PART2 } from "./articles-part2";
import { ARTICLE_CONTENT_PART3 } from "./articles-part3";
import { ARTICLE_CONTENT_PART4 } from "./articles-part4";

export const ALL_ARTICLES: Record<string, import("./articles").ArticleContent> = {
  ...ARTICLE_CONTENT,
  ...ARTICLE_CONTENT_PART2,
  ...ARTICLE_CONTENT_PART3,
  ...ARTICLE_CONTENT_PART4,
};

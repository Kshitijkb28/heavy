/** First focusable element on the page: a native jump that lands focus on <main id="content"> (data-native keeps it out of the smooth-scroll delegate). */
export function SkipLink() {
  return (
    <a href="#content" className="skip-link" data-native="true">
      Skip to content
    </a>
  );
}

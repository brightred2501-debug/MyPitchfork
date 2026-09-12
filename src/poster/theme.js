// CSS is the single source for both the responsive preview and the 1200px export.
export function getPosterFonts() {
  const styles = getComputedStyle(document.documentElement);
  return {
    sans: styles.getPropertyValue("--font-sans").trim(),
    serif: styles.getPropertyValue("--font-serif").trim(),
  };
}

export function getPosterTheme() {
  const styles = getComputedStyle(document.documentElement);
  const theme = { fonts: getPosterFonts() };
  for (const name of [
    "page", "surface", "ink", "ink-soft", "muted", "line", "line-strong",
    "accent-red", "poster-cover-shadow",
  ]) {
    theme[toCamelCase(name)] = styles.getPropertyValue(`--${name}`).trim();
  }
  for (const name of [
    "width", "margin", "frame-inset", "frame-width", "top", "bottom",
    "kicker-size", "kicker-height", "kicker-gap", "title-size", "title-height",
    "title-gap", "artist-size", "artist-height", "header-gap", "cover-size",
    "cover-border", "shadow-blur", "shadow-y", "score-size", "score-border",
    "score-font", "score-right", "main-gap", "rule-width", "comment-size",
    "comment-height", "comment-padding", "comment-gap", "track-height",
    "track-size", "dense-height", "dense-size", "extended-height",
    "extended-size", "number-width", "column-gap", "duration-width",
    "heart-width", "rating-width",
  ]) {
    theme[toCamelCase(name)] = Number(styles.getPropertyValue(`--poster-${name}`));
  }
  return theme;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

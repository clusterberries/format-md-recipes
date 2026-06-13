export function buildPrompt(content, options = {}) {
  return `Convert and format this markdown into a clean recipe-style markdown document with ingredients, steps, and notes where appropriate.\n\nMarkdown input:\n\n${content}\n\nDeliver only markdown output with no additional explanation.`;
}

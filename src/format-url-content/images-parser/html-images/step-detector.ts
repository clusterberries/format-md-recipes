import type * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { getElementFingerprint } from '../../utils/dom-helpers.ts';

const STEP_PATTERN =
  /(?<![\p{L}\p{N}])(?:step|instruction|direction|method|preparation|howto|how-to|process|(?:этап|шаг|инструкц|приготовлен)\p{L}*)(?![\p{L}\p{N}])/iu;

export function findStepContainers($: cheerio.CheerioAPI): Element[] {
  const containers = new Set<Element>();
  $('[itemtype*="HowToStep"]').each((_, element) => {
    containers.add(element);
  });

  $('[class], [id], [data-testid], [data-test]').each((_, element) => {
    const fingerprint = getElementFingerprint($, element);
    const $element = $(element);
    if (
      STEP_PATTERN.test(fingerprint) &&
      $element.find('img').length > 0 &&
      $element.text().trim().length > 20
    ) {
      containers.add(element);
    }
  });

  $('li').each((_, element) => {
    const $item = $(element);
    const parentFingerprint = getElementFingerprint($, $item.parent().get(0));
    const grandParentFingerprint = getElementFingerprint(
      $,
      $item.parent().parent().get(0),
    );
    if (
      STEP_PATTERN.test(`${parentFingerprint} ${grandParentFingerprint}`) &&
      $item.find('img').length > 0
    ) {
      containers.add(element);
    }
  });

  return [...containers];
}

/** Zero-based position of the image's step among its sibling steps, matching the instruction order. */
export function findStepIndex(
  $: cheerio.CheerioAPI,
  image: Element,
  stepContainers: Element[],
): number | undefined {
  const containers = new Set(stepContainers);
  // Outermost first: a step list wrapper can itself look like a step container.
  const candidates = $(image)
    .parents()
    .toArray()
    .filter((ancestor) => containers.has(ancestor))
    .reverse();

  for (const container of candidates) {
    const position = getStepPosition($, container);
    if (position !== undefined) return position;
  }
  return undefined;
}

function getStepPosition(
  $: cheerio.CheerioAPI,
  container: Element,
): number | undefined {
  const siblings = $(container)
    .parent()
    .children()
    .toArray()
    .filter((element) => isSameKind(element, container));
  if (siblings.length > 1) return siblings.indexOf(container);

  // Steps wrapped one by one: fall back to elements sharing the exact same class.
  const className = container.attribs['class'];
  if (!className) return undefined;
  const sameClass = $(container.tagName)
    .toArray()
    .filter(
      (element) =>
        element instanceof Element && element.attribs['class'] === className,
    );
  return sameClass.length > 1 ? sameClass.indexOf(container) : undefined;
}

function isSameKind(element: Element, reference: Element): boolean {
  if (element.tagName !== reference.tagName) return false;
  const referenceClasses = getClassTokens(reference);
  return (
    !referenceClasses.length ||
    getClassTokens(element).some((token) => referenceClasses.includes(token))
  );
}

function getClassTokens(element: Element): string[] {
  return (element.attribs['class'] ?? '').split(/\s+/).filter(Boolean);
}

export function inferStepIndexFromText(
  alt?: string,
  title?: string,
): number | undefined {
  const match = `${alt ?? ''} ${title ?? ''}`.match(
    /(?:step|шаг)\s*[#№]?\s*(\d+)/i,
  );
  if (!match) return undefined;
  const stepNumber = Number.parseInt(match[1] ?? '', 10);
  return Number.isInteger(stepNumber) && stepNumber > 0
    ? stepNumber - 1
    : undefined;
}

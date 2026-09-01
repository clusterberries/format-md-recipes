import type * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { getElementFingerprint } from '../../utils/dom-helpers.ts';

const STEP_PATTERN =
  /\b(step|instruction|direction|method|preparation|howto|how-to|process|этап|шаг|инструкц|приготовлен)\b/i;

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

  const documentOrder = new Map<Element, number>();
  $('body *').each((index, element) => {
    documentOrder.set(element, index);
  });
  return [...containers].sort(
    (a, b) => (documentOrder.get(a) ?? 0) - (documentOrder.get(b) ?? 0),
  );
}

export function findStepIndex(
  $: cheerio.CheerioAPI,
  image: Element,
  stepContainers: Element[],
): number | undefined {
  const ancestors = $(image).parents().toArray();
  const matches = stepContainers
    .map((container, index) => ({
      container,
      index,
      ancestorIndex: ancestors.indexOf(container),
    }))
    .filter((match) => match.ancestorIndex >= 0)
    .sort((a, b) => b.ancestorIndex - a.ancestorIndex);

  return matches[0]?.index;
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

export function warnForMissingFeaturePages(items, pages, logger = console) {
  items.forEach((item) => {
    if (!pages[item.id]) {
      logger.warn(
        `No feature page is registered for navigation item "${item.id}".`,
      );
    }
  });
}

import { getApiAdapter } from "@/services/adapters";
import { normalizeLookupText } from "@/services/adapters/lookupShapes";
import { getCachedLookup } from "@/services/lookupCache";

export function listDocumentTypes(options = {}) {
  const { active = true, logbookType, search } = options;
  const cacheKey = `documentTypes:${active}:${logbookType ?? "all"}`;
  return getCachedLookup(cacheKey, () =>
    getApiAdapter("documentTypes").listDocumentTypes({ active, logbookType }),
  ).then((documentTypes) => {
    const query = normalizeLookupText(search);
    return documentTypes
      .filter((documentType) => documentType.active === active)
      .filter(
        (documentType) =>
          !query ||
          [documentType.name, ...documentType.aliases].some((value) =>
            normalizeLookupText(value).includes(query),
          ),
      )
      .map((documentType) => ({
        ...documentType,
        aliases: [...documentType.aliases],
        logbookTypes: [...documentType.logbookTypes],
      }));
  });
}

export function getDocumentType(id) {
  return getApiAdapter("documentTypes").getDocumentType(id);
}

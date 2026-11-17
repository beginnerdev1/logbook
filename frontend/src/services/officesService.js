import { getApiAdapter } from "@/services/adapters";
import { normalizeLookupText } from "@/services/adapters/lookupShapes";
import { getCachedLookup } from "@/services/lookupCache";

export function listOffices(options = {}) {
  const { active = true, kind, search } = options;
  return getCachedLookup(`offices:${active}`, () =>
    getApiAdapter("offices").listOffices({ active }),
  ).then((offices) => {
    const query = normalizeLookupText(search);
    return offices
      .filter((office) => office.active === active)
      .filter((office) => !kind || office.kind === kind)
      .filter(
        (office) =>
          !query ||
          [office.code, office.fullName, ...office.aliases].some((value) =>
            normalizeLookupText(value).includes(query),
          ),
      )
      .map((office) => ({ ...office, aliases: [...office.aliases] }));
  });
}

export function getOffice(id) {
  return getApiAdapter("offices").getOffice(id);
}

import { MOCK_DOCUMENT_TYPES, MOCK_OFFICES } from "@/data/mockLookups";
import { mockEntriesAdapter } from "@/services/adapters/mockEntriesAdapter";
import {
  normalizeDocumentType,
  normalizeOffice,
} from "@/services/adapters/lookupShapes";

function invokeMockService(loadService, method, args) {
  return loadService().then((service) => service[method](...args));
}

const listUsers = (...args) =>
  invokeMockService(() => import("@/services/usersService"), "listUsers", args);
const listNotifications = (...args) =>
  invokeMockService(
    () => import("@/services/notificationsService"),
    "listNotifications",
    args,
  );
function filterLookupItems(items, search) {
  const query = String(search ?? "")
    .trim()
    .toLocaleLowerCase("en-PH");
  if (!query) return items.map((item) => structuredClone(item));
  return items
    .filter((item) =>
      [item.code, item.name, item.fullName, ...(item.aliases ?? [])]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase("en-PH").includes(query)),
    )
    .map((item) => structuredClone(item));
}

export const mockApiAdapter = {
  listUsers,
  getUsers: listUsers,
  listNotifications,
  getNotifications: listNotifications,
  listOffices: ({ active = true, kind, search } = {}) =>
    filterLookupItems(
      MOCK_OFFICES.filter(
        (office) => office.active === active && (!kind || office.kind === kind),
      ),
      search,
    ).map(normalizeOffice),
  getOffice: async (id) => {
    const office = MOCK_OFFICES.find((item) => item.id === id);
    return office ? normalizeOffice(structuredClone(office)) : null;
  },
  listDocumentTypes: ({ active = true, logbookType, search } = {}) => {
    const scoped = MOCK_DOCUMENT_TYPES.filter(
      (item) =>
        item.active === active &&
        (!logbookType || item.logbookTypes.includes(logbookType)),
    );
    return filterLookupItems(scoped, search).map(normalizeDocumentType);
  },
  getDocumentType: async (id) => {
    const documentType = MOCK_DOCUMENT_TYPES.find((item) => item.id === id);
    return documentType
      ? normalizeDocumentType(structuredClone(documentType))
      : null;
  },
  ...mockEntriesAdapter,
};

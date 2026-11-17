import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsyncData } from "@/hooks/useAsyncData";

describe("useAsyncData", () => {
  it("loads data and reloads on request", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([2]);
    const { result } = renderHook(() => useAsyncData(loader, { page: 1 }));

    await waitFor(() => expect(result.current.data).toEqual([1]));
    expect(result.current.isLoading).toBe(false);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toEqual([2]));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("aborts prior requests when params change and when unmounted", async () => {
    const requests = [];
    const loader = vi.fn((params, { signal }) => {
      requests.push({ params, signal });
      return new Promise(() => {});
    });
    const { rerender, unmount } = renderHook(
      ({ params }) => useAsyncData(loader, params),
      { initialProps: { params: { page: 1 } } },
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    rerender({ params: { page: 2 } });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].signal.aborted).toBe(false);
    unmount();
    expect(requests[1].signal.aborted).toBe(true);
  });

  it("reports loader errors", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("load failed"));
    const { result } = renderHook(() => useAsyncData(loader, {}));
    await waitFor(() =>
      expect(result.current.error?.message).toBe("load failed"),
    );
    expect(result.current.isLoading).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { filterProxyHeaders } from "./proxy";

describe("proxy header filtering", () => {
  test("drops credentials and hop-by-hop headers", () => {
    const filtered = filterProxyHeaders({
      authorization: "Bearer secret",
      cookie: "api_manager_session=secret",
      host: "localhost",
      "content-type": "application/json",
      accept: "application/json",
      "x-request-id": "abc123"
    });

    expect(filtered).toEqual({
      accept: "application/json",
      "content-type": "application/json",
      "x-request-id": "abc123"
    });
  });
});

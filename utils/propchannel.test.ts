import { describe, it, expect } from "vitest";
import { makeReceiverProperty } from "./propchannel";

describe("makeReceiverProperty", () => {
  it("maps CRM stock row to nested receiver property shape", () => {
    const prop = {
      id: "11111111-1111-1111-1111-111111111111",
      street_address: "12 Sample St",
      suburb: "Brisbane",
      state: "QLD",
      bedrooms: 4,
      bathrooms: 2,
      car_spaces: 2,
      total_package_price: 750000,
      house_price: null,
      builder_name: "Acme Homes",
      estate_name: "Sunny Meadows",
      lot_number: "42",
      status: "active",
      brochure_url: "https://example.com/hero.jpg",
    };
    const fin = { gross_developer_fee: 25000 };
    const media = [{ kind: "gallery", storage_path: "https://cdn.example.com/g1.jpg" }];

    const r = makeReceiverProperty(prop as any, fin, media as any);
    expect(r.crm_property_id).toBe(prop.id);
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.suburb).toBe("Brisbane");
    expect(r.state.length).toBeGreaterThanOrEqual(2);
    expect(r.price).toBeGreaterThan(0);
    expect(r.developer_name).toBe("Acme Homes");
    expect(r.address_line).toContain("12 Sample St");
    expect(r.status).toBe("available");
    expect(r.gross_developer_fee).toBe(25000);
    expect(r.hero_image_url).toBe("https://example.com/hero.jpg");
    expect(r.developer_project).toBe("Sunny Meadows");
    // Only allowed outbound keys are used (no estate_name / lot_number on receiver object)
    expect((r as any).estate_name).toBeUndefined();
    expect((r as any).lot_number).toBeUndefined();
  });
});


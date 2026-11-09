/**
 * Stand-in NEXUS answers for the Compliance and Stock help videos.
 * Suburb names are real places; every figure and note is invented for the demo.
 */
const infra = (...items) => JSON.stringify(items);

const SUBURBS = [
  ["Caboolture", "QLD", 615000, 6.2, 29500, ["Train line to the city", "New hospital wing", "Town centre upgrade"]],
  ["Ripley", "QLD", 640000, 7.4, 14800, ["New town centre", "Planned rail extension", "Two new schools"]],
  ["Logan Reserve", "QLD", 685000, 5.1, 9200, ["Motorway upgrade", "New primary school", "District sports park"]],
  ["Pimpama", "QLD", 720000, 4.3, 21400, ["Train station", "Regional sports hub", "Shopping centre expansion"]],
  ["Burpengary", "QLD", 660000, 5.8, 16900, ["Train line to the city", "Highway interchange upgrade"]],
  ["Oran Park", "NSW", 965000, 3.6, 18700, ["New town centre", "Planned metro line", "Leisure centre"]],
  ["Marsden Park", "NSW", 1050000, 2.9, 17300, ["Business park", "Planned metro extension", "New high school"]],
  ["Tarneit", "VIC", 668000, -0.8, 56400, ["Train station", "New town centre", "Road duplication"]],
  ["Clyde North", "VIC", 702000, 1.4, 31200, ["New schools", "Planned rail extension", "Retail precinct"]],
  ["Angle Vale", "SA", 588000, 8.9, 5600, ["Expressway access", "New shopping village"]],
  ["Baldivis", "WA", 655000, 9.6, 39800, ["Freeway access", "New secondary college", "Regional shopping centre"]],
];

export default {
  "GET /api/suburbs": () => ({
    suburbs: SUBURBS.map(([suburb, state, median_price, price_growth_pct, population, items]) => ({
      suburb,
      state,
      median_price,
      price_growth_pct,
      population,
      last_updated: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      key_infrastructure: infra(...items),
    })),
  }),
};

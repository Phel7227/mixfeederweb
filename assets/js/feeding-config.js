// MixFeeder Calculator settings. Change values here, not in the calculation code.
//
// factors: life-stage multipliers for DER = RER x factor. Common values from published
//   veterinary tables (AAHA nutrition guidelines and similar). Not verified against the
//   owner's own table yet.
//   Confirmed by the owner (Jasmine T, MERO-22).
// bodyShape: multiplier applied on top of the life-stage factor. Fat reduces the target,
//   skinny increases it. The amounts are a common starting point, not a published standard:
//   fat x0.8 sits between the weight-loss factor (1.0) and inactive adult factors (1.2-1.4);
//   skinny x1.1 is a modest increase. Confirmed by the owner (Jasmine T, MERO-22).
// ingredients: kcal per 100g range for each raw ingredient, { low, high }. The average is the
//   midpoint. The user picks lower, average or higher. Common values from a web search of
//   published figures. They conflict between sources and are not verified against USDA FoodData
//   Central. Confirmed by the owner (Jasmine T, MERO-22).
// styles: ingredient split by weight of the raw portion (owner-approved). Each style totals 100%.
window.FEEDING_CONFIG = {
  factors: {
    confirmed: true,
    table: {
      "Puppy 0-4 months": 3.0,
      "Puppy 4-12 months": 2.0,
      "Adult, intact": 1.8,
      "Adult, neutered": 1.6,
      "Senior": 1.4
    }
  },
  bodyShape: {
    confirmed: true,
    options: {
      underweight: { label: "Skinny (underweight)", factor: 1.1 },
      ideal: { label: "Ideal", factor: 1.0 },
      overweight: { label: "Fat (overweight)", factor: 0.8 }
    }
  },
  ingredients: {
    // Muscle: 110 (UK calculator) to 165 (per-lb figures converted). Bone: 110 to 150 (meaty bone).
    // Liver: 100 to 135 (beef liver, USDA mirror). Organs: heart about 115, range 100 to 120.
    // Vegetables and fruit: 25 per 100g (UK calculator), range 20 to 30.
    muscle: { label: "Muscle meat", kcalPer100g: { low: 110, high: 165 } },
    bone: { label: "Edible bone", kcalPer100g: { low: 110, high: 150 } },
    liver: { label: "Liver", kcalPer100g: { low: 100, high: 135 } },
    organs: { label: "Other secreting organs", kcalPer100g: { low: 100, high: 120 } },
    veg: { label: "Vegetables and fruit", kcalPer100g: { low: 20, high: 30 } }
  },
  // Activity level: multiplier on top of the life-stage factor. Normal leaves the target as it is.
  // PROPOSED values, not yet confirmed by the owner.
  activity: {
    label: "Activity level",
    options: {
      low: { label: "Low", factor: 0.6 },
      normal: { label: "Normal", factor: 1.0 },
      high: { label: "High", factor: 1.25 }
    }
  },
  // Feeding rate: daily food in grams for each weight band (lower bound inclusive, upper bound exclusive)
  feedingRates: [
    { min: 5, max: 10, low: 50, high: 110 },
    { min: 10, max: 20, low: 100, high: 150 },
    { min: 20, max: 30, low: 140, high: 200 },
    { min: 30, max: 40, low: 190, high: 290 },
    { min: 40, max: 50, low: 280, high: 380 }
  ],
  styles: {
    barf: {
      label: "BARF",
      split: { muscle: 0.70, bone: 0.10, liver: 0.05, organs: 0.05, veg: 0.10 }
    },
    "80-10-10": {
      label: "80/10/10",
      split: { muscle: 0.80, bone: 0.10, liver: 0.05, organs: 0.05, veg: 0 }
    }
  },
};

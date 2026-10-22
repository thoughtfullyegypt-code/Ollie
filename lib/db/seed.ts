import { randomUUID } from "node:crypto";
import { pool, transaction } from "./index";
import { migrate } from "./migrate";
const sampleGuests = [
  [
    "Luna, probably tired",
    "astronaut",
    "soup",
    "Just flew 384,400 km. Is there any coffee?",
  ],
  [
    "Count Crumbula",
    "vampire",
    "garlic-bread",
    "Yes, it’s garlic bread. I’m working through some things.",
  ],
  [
    "Margot & the shades",
    "grandma",
    "cake",
    "I brought cake and absolutely no unsolicited advice.",
  ],
  ["Business Raccoon", "raccoon", "fries", "Let’s circle back to those fries."],
  [
    "Fern, from accounting",
    "plant",
    "salad",
    "Thrilled to put down roots somewhere new.",
  ],
  [
    "Detective Broth",
    "detective",
    "soup",
    "The soup has an alibi. The spoon does not.",
  ],
  [
    "A very polite ghost",
    "ghost",
    "pie",
    "Sorry, is anyone sitting through this chair?",
  ],
  [
    "Miso the cat",
    "cat",
    "sushi",
    "I came for the conversation. And all of the fish.",
  ],
  [
    "Mushroom for one more",
    "mushroom",
    "dumplings",
    "There is always a little mushroom at this table.",
  ],
  [
    "Sir Ribbert",
    "frog",
    "olives",
    "A little pond water pairs beautifully with this.",
  ],
  [
    "Beep, please",
    "robot",
    "spaghetti",
    "My recipe has one small syntax error.",
  ],
  ["The midnight baker", "human", "pancakes", "Breakfast is a state of mind."],
  ["Professor Nap", "grandma", "pie", "Wake me when someone says dessert."],
  [
    "Cosmic leftovers",
    "astronaut",
    "mystery-jelly",
    "This followed me home from Saturn.",
  ],
  [
    "Lady Nightshade",
    "vampire",
    "olives",
    "A dramatic entrance is a perfectly valid dish.",
  ],
  ["The neighborhood fern", "plant", "salad", "Please pass the sunlight."],
  [
    "Inspector Noodle",
    "detective",
    "spaghetti",
    "A compelling twist. Several, actually.",
  ],
  ["Crunch, LLC", "raccoon", "fries", "The forecast is mostly snacks."],
  ["Cloud Nine", "ghost", "cake", "I’ve been dying to meet everyone."],
  [
    "Pesto enthusiast",
    "human",
    "spaghetti",
    "I packed enough basil for all of us.",
  ],
  [
    "Crumbelina",
    "mushroom",
    "garlic-bread",
    "I like my bread with a side of bread.",
  ],
  ["Dinner.exe", "robot", "dumplings", "Friendship installed successfully."],
  ["Miss Whiskers", "cat", "sushi", "This is my formal dining face."],
  ["The soup romantic", "frog", "soup", "It’s not a phase, it’s a bisque."],
  ["An early bird", "human", "pancakes", "I am six hours early for breakfast."],
  [
    "A quiet companion",
    "plant",
    "salad",
    "Comfortable silence is also good company.",
  ],
  [
    "Nervous about noodles",
    "detective",
    "spaghetti",
    "I practiced my introduction in the mirror.",
  ],
  ["Birthday orbit", "astronaut", "cake", "One more trip around the sun."],
] as const;
const skins = [
  "#f4d6b9",
  "#edbd91",
  "#dca276",
  "#bd805a",
  "#925b3f",
  "#654335",
];
const colors = ["#a6ae8a", "#d46a52", "#e7bf62", "#8ba4b1", "#9e7288"];
export async function seedDevelopment() {
  if (
    process.env.APP_MODE !== "development" ||
    process.env.ENABLE_DEV_TOOLS !== "true"
  )
    throw new Error(
      "Development seed requires APP_MODE=development and ENABLE_DEV_TOOLS=true. Production is never seeded.",
    );
  await migrate();
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(890002)");
    await c.query(
      `INSERT INTO "user"(id,name,email,"emailVerified",role) VALUES('seed-host','The sample dinner','seed-host@example.invalid',true,'user') ON CONFLICT(id) DO NOTHING`,
    );
    for (let i = 0; i < sampleGuests.length; i++) {
      const [name, base, dish, message] = sampleGuests[i];
      const seatId = i < 24 ? i + 1 : (i - 23) * 1250 + 1;
      const existing = await c.query(
        "SELECT state FROM seats WHERE id=$1 FOR UPDATE",
        [seatId],
      );
      if (existing.rows[0]?.state !== "available") continue;
      const id = `seed-order-${seatId}`;
      const customization = {
        base,
        accessory: base === "human" ? "curls" : "none",
        outfit: i % 3 === 0 ? "stripes" : "signature",
        skin: skins[i % skins.length],
        color: colors[i % colors.length],
      };
      const profile = { displayName: name, message, dish, customization };
      await c.query(
        "INSERT INTO orders(id,user_id,package_id,amount,currency,status,provider,profile_draft,is_demo) VALUES($1,'seed-host','one',0,'usd','paid','seed',$2,true) ON CONFLICT(id) DO NOTHING",
        [id, JSON.stringify(profile)],
      );
      await c.query(
        "INSERT INTO order_items(order_id,seat_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id, seatId],
      );
      await c.query(
        "UPDATE seats SET state='purchased',owner_id='seed-host',order_id=$2 WHERE id=$1",
        [seatId, id],
      );
      await c.query(
        "INSERT INTO profiles(seat_id,display_name,message,dish,customization,visibility,is_demo,guest_kind) VALUES($1,$2,$3,$4,$5,'published',true,'demo') ON CONFLICT(seat_id) DO NOTHING",
        [seatId, name, message, dish, JSON.stringify(customization)],
      );
    }
  });
  return {
    seeded: true,
    label: "28 fictional illustration guests. Development only.",
  };
}

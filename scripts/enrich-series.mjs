import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is required.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

function normalize(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

// ── SERIES DEFINITIONS ──
// Each series has a name and list of games with their details
const SERIES = {

  "The Legend of Zelda": [
    { title: "The Legend of Zelda", year: "1986", platforms: ["nes"], platNames: ["NES"] },
    { title: "Zelda II: The Adventure of Link", year: "1987", platforms: ["nes"], platNames: ["NES"] },
    { title: "The Legend of Zelda: A Link to the Past", year: "1991", platforms: ["snes"], platNames: ["SNES"] },
    { title: "The Legend of Zelda: Link's Awakening", year: "1993", platforms: ["gb"], platNames: ["Game Boy"] },
    { title: "The Legend of Zelda: Ocarina of Time", year: "1998", platforms: ["n64"], platNames: ["Nintendo 64"] },
    { title: "The Legend of Zelda: Majora's Mask", year: "2000", platforms: ["n64"], platNames: ["Nintendo 64"] },
    { title: "The Legend of Zelda: Oracle of Seasons", year: "2001", platforms: ["gbc"], platNames: ["Game Boy Color"] },
    { title: "The Legend of Zelda: Oracle of Ages", year: "2001", platforms: ["gbc"], platNames: ["Game Boy Color"] },
    { title: "The Legend of Zelda: Four Swords", year: "2002", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "The Legend of Zelda: The Wind Waker", year: "2002", platforms: ["gamecube"], platNames: ["GameCube"] },
    { title: "The Legend of Zelda: Four Swords Adventures", year: "2004", platforms: ["gamecube"], platNames: ["GameCube"] },
    { title: "The Legend of Zelda: The Minish Cap", year: "2004", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "The Legend of Zelda: Twilight Princess", year: "2006", platforms: ["gamecube", "wii"], platNames: ["GameCube", "Wii"] },
    { title: "The Legend of Zelda: Phantom Hourglass", year: "2007", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "The Legend of Zelda: Spirit Tracks", year: "2009", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "The Legend of Zelda: Skyward Sword", year: "2011", platforms: ["wii"], platNames: ["Wii"] },
    { title: "The Legend of Zelda: A Link Between Worlds", year: "2013", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "The Legend of Zelda: Breath of the Wild", year: "2017", platforms: ["switch_1", "wii_u"], platNames: ["Nintendo Switch", "Wii U"] },
    { title: "The Legend of Zelda: Tears of the Kingdom", year: "2023", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "The Legend of Zelda: Echoes of Wisdom", year: "2024", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
  ],

  "Pokémon": [
    { title: "Pokémon Red and Blue", year: "1998", platforms: ["gb"], platNames: ["Game Boy"] },
    { title: "Pokémon Yellow", year: "1998", platforms: ["gb"], platNames: ["Game Boy"] },
    { title: "Pokémon Gold and Silver", year: "2000", platforms: ["gbc"], platNames: ["Game Boy Color"] },
    { title: "Pokémon Crystal", year: "2001", platforms: ["gbc"], platNames: ["Game Boy Color"] },
    { title: "Pokémon Ruby and Sapphire", year: "2002", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Pokémon FireRed and LeafGreen", year: "2004", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Pokémon Emerald", year: "2004", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Pokémon Diamond and Pearl", year: "2006", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "Pokémon Platinum", year: "2008", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "Pokémon HeartGold and SoulSilver", year: "2009", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "Pokémon Black and White", year: "2010", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "Pokémon Black 2 and White 2", year: "2012", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "Pokémon X and Y", year: "2013", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "Pokémon Omega Ruby and Alpha Sapphire", year: "2014", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "Pokémon Sun and Moon", year: "2016", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "Pokémon Ultra Sun and Ultra Moon", year: "2017", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "Pokémon Let's Go, Pikachu! and Let's Go, Eevee!", year: "2018", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Pokémon Sword and Shield", year: "2019", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Pokémon Brilliant Diamond and Shining Pearl", year: "2021", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Pokémon Legends: Arceus", year: "2022", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Pokémon Scarlet and Violet", year: "2022", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
  ],

  "Final Fantasy": [
    { title: "Final Fantasy", year: "1987", platforms: ["nes"], platNames: ["NES"] },
    { title: "Final Fantasy II", year: "1988", platforms: ["nes"], platNames: ["NES"] },
    { title: "Final Fantasy III", year: "1990", platforms: ["nes"], platNames: ["NES"] },
    { title: "Final Fantasy IV", year: "1991", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Final Fantasy V", year: "1992", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Final Fantasy VI", year: "1994", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Final Fantasy VII", year: "1997", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Final Fantasy VIII", year: "1999", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Final Fantasy IX", year: "2000", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Final Fantasy X", year: "2001", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Final Fantasy XI", year: "2002", platforms: ["ps2", "pc"], platNames: ["PlayStation 2", "PC"] },
    { title: "Final Fantasy XII", year: "2006", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Final Fantasy XIII", year: "2009", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Final Fantasy XIV", year: "2013", platforms: ["ps4", "ps5", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "PC"] },
    { title: "Final Fantasy XV", year: "2016", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Final Fantasy XVI", year: "2023", platforms: ["ps5"], platNames: ["PlayStation 5"] },
    { title: "Final Fantasy VII Remake", year: "2020", platforms: ["ps4", "ps5", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "PC"] },
    { title: "Final Fantasy VII Rebirth", year: "2024", platforms: ["ps5"], platNames: ["PlayStation 5"] },
  ],

  "Resident Evil": [
    { title: "Resident Evil", year: "1996", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Resident Evil 2", year: "1998", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Resident Evil 3: Nemesis", year: "1999", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Resident Evil – Code: Veronica", year: "2000", platforms: ["dreamcast"], platNames: ["Dreamcast"] },
    { title: "Resident Evil 0", year: "2002", platforms: ["gamecube"], platNames: ["GameCube"] },
    { title: "Resident Evil 4", year: "2005", platforms: ["gamecube", "ps2"], platNames: ["GameCube", "PlayStation 2"] },
    { title: "Resident Evil 5", year: "2009", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Resident Evil: Revelations", year: "2012", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "Resident Evil 6", year: "2012", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Resident Evil: Revelations 2", year: "2015", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Resident Evil 7: Biohazard", year: "2017", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Resident Evil 2 Remake", year: "2019", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Resident Evil 3 Remake", year: "2020", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Resident Evil Village", year: "2021", platforms: ["ps4", "ps5", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox Series X|S", "PC"] },
    { title: "Resident Evil 4 Remake", year: "2023", platforms: ["ps4", "ps5", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox Series X|S", "PC"] },
  ],

  "Metal Gear": [
    { title: "Metal Gear", year: "1987", platforms: ["nes"], platNames: ["NES"] },
    { title: "Metal Gear 2: Solid Snake", year: "1990", platforms: ["nes"], platNames: ["NES"] },
    { title: "Metal Gear Solid", year: "1998", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Metal Gear Solid 2: Sons of Liberty", year: "2001", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Metal Gear Solid 3: Snake Eater", year: "2004", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Metal Gear Solid: Portable Ops", year: "2006", platforms: ["psp"], platNames: ["PSP"] },
    { title: "Metal Gear Solid 4: Guns of the Patriots", year: "2008", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Metal Gear Solid: Peace Walker", year: "2010", platforms: ["psp"], platNames: ["PSP"] },
    { title: "Metal Gear Solid V: Ground Zeroes", year: "2014", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Metal Gear Solid V: The Phantom Pain", year: "2015", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "God of War": [
    { title: "God of War", year: "2005", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "God of War II", year: "2007", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "God of War: Chains of Olympus", year: "2008", platforms: ["psp"], platNames: ["PSP"] },
    { title: "God of War III", year: "2010", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "God of War: Ghost of Sparta", year: "2010", platforms: ["psp"], platNames: ["PSP"] },
    { title: "God of War: Ascension", year: "2013", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "God of War", year: "2018", platforms: ["ps4", "pc"], platNames: ["PlayStation 4", "PC"] },
    { title: "God of War Ragnarök", year: "2022", platforms: ["ps4", "ps5"], platNames: ["PlayStation 4", "PlayStation 5"] },
  ],

  "Donkey Kong": [
    { title: "Donkey Kong Country", year: "1994", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Donkey Kong Country 2: Diddy's Kong Quest", year: "1995", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Donkey Kong Country 3: Dixie Kong's Double Trouble!", year: "1996", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Donkey Kong 64", year: "1999", platforms: ["n64"], platNames: ["Nintendo 64"] },
    { title: "Donkey Kong Country Returns", year: "2010", platforms: ["wii"], platNames: ["Wii"] },
    { title: "Donkey Kong Country: Tropical Freeze", year: "2014", platforms: ["wii_u", "switch_1"], platNames: ["Wii U", "Nintendo Switch"] },
  ],

  "Halo": [
    { title: "Halo: Combat Evolved", year: "2001", platforms: ["xbox_original"], platNames: ["Xbox"] },
    { title: "Halo 2", year: "2004", platforms: ["xbox_original"], platNames: ["Xbox"] },
    { title: "Halo 3", year: "2007", platforms: ["xbox_360"], platNames: ["Xbox 360"] },
    { title: "Halo 3: ODST", year: "2009", platforms: ["xbox_360"], platNames: ["Xbox 360"] },
    { title: "Halo: Reach", year: "2010", platforms: ["xbox_360"], platNames: ["Xbox 360"] },
    { title: "Halo 4", year: "2012", platforms: ["xbox_360"], platNames: ["Xbox 360"] },
    { title: "Halo 5: Guardians", year: "2015", platforms: ["xbox_one"], platNames: ["Xbox One"] },
    { title: "Halo Infinite", year: "2021", platforms: ["xbox_series_xs", "xbox_one", "pc"], platNames: ["Xbox Series X|S", "Xbox One", "PC"] },
  ],

  "Gears of War": [
    { title: "Gears of War", year: "2006", platforms: ["xbox_360"], platNames: ["Xbox 360"] },
    { title: "Gears of War 2", year: "2008", platforms: ["xbox_360"], platNames: ["Xbox 360"] },
    { title: "Gears of War 3", year: "2011", platforms: ["xbox_360"], platNames: ["Xbox 360"] },
    { title: "Gears of War: Judgment", year: "2013", platforms: ["xbox_360"], platNames: ["Xbox 360"] },
    { title: "Gears of War 4", year: "2016", platforms: ["xbox_one", "pc"], platNames: ["Xbox One", "PC"] },
    { title: "Gears 5", year: "2019", platforms: ["xbox_one", "xbox_series_xs", "pc"], platNames: ["Xbox One", "Xbox Series X|S", "PC"] },
  ],

  "Doom": [
    { title: "Doom", year: "1993", platforms: ["pc"], platNames: ["PC"] },
    { title: "Doom II: Hell on Earth", year: "1994", platforms: ["pc"], platNames: ["PC"] },
    { title: "Doom 3", year: "2004", platforms: ["pc", "xbox_original"], platNames: ["PC", "Xbox"] },
    { title: "Doom", year: "2016", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Doom Eternal", year: "2020", platforms: ["ps4", "xbox_one", "pc", "switch_1"], platNames: ["PlayStation 4", "Xbox One", "PC", "Nintendo Switch"] },
  ],

  "Fallout": [
    { title: "Fallout", year: "1997", platforms: ["pc"], platNames: ["PC"] },
    { title: "Fallout 2", year: "1998", platforms: ["pc"], platNames: ["PC"] },
    { title: "Fallout 3", year: "2008", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Fallout: New Vegas", year: "2010", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Fallout 4", year: "2015", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Fallout 76", year: "2018", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "The Elder Scrolls": [
    { title: "The Elder Scrolls III: Morrowind", year: "2002", platforms: ["xbox_original", "pc"], platNames: ["Xbox", "PC"] },
    { title: "The Elder Scrolls IV: Oblivion", year: "2006", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "The Elder Scrolls V: Skyrim", year: "2011", platforms: ["ps3", "xbox_360", "pc", "switch_1"], platNames: ["PlayStation 3", "Xbox 360", "PC", "Nintendo Switch"] },
  ],

  "Grand Theft Auto": [
    { title: "Grand Theft Auto III", year: "2001", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Grand Theft Auto: Vice City", year: "2002", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Grand Theft Auto: San Andreas", year: "2004", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Grand Theft Auto IV", year: "2008", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Grand Theft Auto V", year: "2013", platforms: ["ps3", "ps4", "xbox_360", "xbox_one", "pc"], platNames: ["PlayStation 3", "PlayStation 4", "Xbox 360", "Xbox One", "PC"] },
    { title: "Grand Theft Auto VI", year: "2025", platforms: ["ps5", "xbox_series_xs"], platNames: ["PlayStation 5", "Xbox Series X|S"] },
  ],

  "Red Dead Redemption": [
    { title: "Red Dead Revolver", year: "2004", platforms: ["ps2", "xbox_original"], platNames: ["PlayStation 2", "Xbox"] },
    { title: "Red Dead Redemption", year: "2010", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Red Dead Redemption 2", year: "2018", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "Assassin's Creed": [
    { title: "Assassin's Creed", year: "2007", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Assassin's Creed II", year: "2009", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Assassin's Creed: Brotherhood", year: "2010", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Assassin's Creed: Revelations", year: "2011", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Assassin's Creed III", year: "2012", platforms: ["ps3", "xbox_360", "wii_u"], platNames: ["PlayStation 3", "Xbox 360", "Wii U"] },
    { title: "Assassin's Creed IV: Black Flag", year: "2013", platforms: ["ps3", "ps4", "xbox_360", "xbox_one", "wii_u"], platNames: ["PlayStation 3", "PlayStation 4", "Xbox 360", "Xbox One", "Wii U"] },
    { title: "Assassin's Creed Unity", year: "2014", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Assassin's Creed Syndicate", year: "2015", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Assassin's Creed Origins", year: "2017", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Assassin's Creed Odyssey", year: "2018", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Assassin's Creed Valhalla", year: "2020", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
    { title: "Assassin's Creed Mirage", year: "2023", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
  ],

  "Silent Hill": [
    { title: "Silent Hill", year: "1999", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Silent Hill 2", year: "2001", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Silent Hill 3", year: "2003", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Silent Hill 4: The Room", year: "2004", platforms: ["ps2", "xbox_original"], platNames: ["PlayStation 2", "Xbox"] },
    { title: "Silent Hill: Origins", year: "2007", platforms: ["psp", "ps2"], platNames: ["PSP", "PlayStation 2"] },
    { title: "Silent Hill: Homecoming", year: "2008", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Silent Hill: Shattered Memories", year: "2009", platforms: ["wii", "psp"], platNames: ["Wii", "PSP"] },
    { title: "Silent Hill: Downpour", year: "2012", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
  ],

  "Mass Effect": [
    { title: "Mass Effect", year: "2007", platforms: ["xbox_360", "pc"], platNames: ["Xbox 360", "PC"] },
    { title: "Mass Effect 2", year: "2010", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Mass Effect 3", year: "2012", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Mass Effect: Andromeda", year: "2017", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "BioShock": [
    { title: "BioShock", year: "2007", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "BioShock 2", year: "2010", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "BioShock Infinite", year: "2013", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
  ],

  "Borderlands": [
    { title: "Borderlands", year: "2009", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Borderlands 2", year: "2012", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Borderlands: The Pre-Sequel", year: "2014", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Borderlands 3", year: "2019", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "Far Cry": [
    { title: "Far Cry", year: "2004", platforms: ["pc"], platNames: ["PC"] },
    { title: "Far Cry 2", year: "2008", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Far Cry 3", year: "2012", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Far Cry 4", year: "2014", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Far Cry 5", year: "2018", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Far Cry 6", year: "2021", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
  ],

  "The Witcher": [
    { title: "The Witcher", year: "2007", platforms: ["pc"], platNames: ["PC"] },
    { title: "The Witcher 2: Assassins of Kings", year: "2011", platforms: ["xbox_360", "pc"], platNames: ["Xbox 360", "PC"] },
    { title: "The Witcher 3: Wild Hunt", year: "2015", platforms: ["ps4", "xbox_one", "pc", "switch_1"], platNames: ["PlayStation 4", "Xbox One", "PC", "Nintendo Switch"] },
  ],

  "Diablo": [
    { title: "Diablo", year: "1996", platforms: ["pc"], platNames: ["PC"] },
    { title: "Diablo II", year: "2000", platforms: ["pc"], platNames: ["PC"] },
    { title: "Diablo III", year: "2012", platforms: ["ps3", "xbox_360", "ps4", "xbox_one", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PlayStation 4", "Xbox One", "PC"] },
    { title: "Diablo IV", year: "2023", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
  ],

  "Dark Souls": [
    { title: "Dark Souls", year: "2011", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Dark Souls II", year: "2014", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Dark Souls III", year: "2016", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "Cyberpunk": [
    { title: "Cyberpunk 2077", year: "2020", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
  ],

  "Dead Space": [
    { title: "Dead Space", year: "2008", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Dead Space 2", year: "2011", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Dead Space 3", year: "2013", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
  ],

  "Batman: Arkham": [
    { title: "Batman: Arkham Asylum", year: "2009", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Batman: Arkham City", year: "2011", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Batman: Arkham Origins", year: "2013", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Batman: Arkham Knight", year: "2015", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "Uncharted": [
    { title: "Uncharted: Drake's Fortune", year: "2007", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Uncharted 2: Among Thieves", year: "2009", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Uncharted 3: Drake's Deception", year: "2011", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Uncharted 4: A Thief's End", year: "2016", platforms: ["ps4"], platNames: ["PlayStation 4"] },
    { title: "Uncharted: The Lost Legacy", year: "2017", platforms: ["ps4", "pc"], platNames: ["PlayStation 4", "PC"] },
  ],

  "Devil May Cry": [
    { title: "Devil May Cry", year: "2001", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Devil May Cry 2", year: "2003", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Devil May Cry 3: Dante's Awakening", year: "2005", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Devil May Cry 4", year: "2008", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "DmC: Devil May Cry", year: "2013", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Devil May Cry 5", year: "2019", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "Persona": [
    { title: "Persona 4 Golden", year: "2012", platforms: ["ps_vita", "pc"], platNames: ["PS Vita", "PC"] },
    { title: "Persona 5", year: "2016", platforms: ["ps3", "ps4"], platNames: ["PlayStation 3", "PlayStation 4"] },
    { title: "Persona 5 Royal", year: "2019", platforms: ["ps4", "ps5", "xbox_series_xs", "pc", "switch_1"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox Series X|S", "PC", "Nintendo Switch"] },
    { title: "Persona 5 Strikers", year: "2020", platforms: ["ps4", "switch_1", "pc"], platNames: ["PlayStation 4", "Nintendo Switch", "PC"] },
    { title: "Persona 3 Reload", year: "2024", platforms: ["ps4", "ps5", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox Series X|S", "PC"] },
  ],

  "Super Mario": [
    { title: "Super Mario Bros.", year: "1985", platforms: ["nes"], platNames: ["NES"] },
    { title: "Super Mario Bros. 2", year: "1988", platforms: ["nes"], platNames: ["NES"] },
    { title: "Super Mario Bros. 3", year: "1988", platforms: ["nes"], platNames: ["NES"] },
    { title: "Super Mario World", year: "1990", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Super Mario 64", year: "1996", platforms: ["n64"], platNames: ["Nintendo 64"] },
    { title: "Super Mario Sunshine", year: "2002", platforms: ["gamecube"], platNames: ["GameCube"] },
    { title: "Super Mario Galaxy", year: "2007", platforms: ["wii"], platNames: ["Wii"] },
    { title: "Super Mario Galaxy 2", year: "2010", platforms: ["wii"], platNames: ["Wii"] },
    { title: "Super Mario 3D Land", year: "2011", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "New Super Mario Bros.", year: "2006", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "New Super Mario Bros. Wii", year: "2009", platforms: ["wii"], platNames: ["Wii"] },
    { title: "Super Mario 3D World", year: "2013", platforms: ["wii_u"], platNames: ["Wii U"] },
    { title: "Super Mario Odyssey", year: "2017", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Super Mario Bros. Wonder", year: "2023", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Mario Kart 8 Deluxe", year: "2017", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Super Mario RPG", year: "1996", platforms: ["snes"], platNames: ["SNES"] },
  ],

  "Call of Duty": [
    { title: "Call of Duty", year: "2003", platforms: ["pc"], platNames: ["PC"] },
    { title: "Call of Duty 2", year: "2005", platforms: ["xbox_360", "pc"], platNames: ["Xbox 360", "PC"] },
    { title: "Call of Duty 4: Modern Warfare", year: "2007", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Call of Duty: Modern Warfare 2", year: "2009", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Call of Duty: Black Ops", year: "2010", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Call of Duty: Modern Warfare 3", year: "2011", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Call of Duty: Black Ops 6", year: "2024", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
  ],

  "Star Wars": [
    { title: "Star Wars: Knights of the Old Republic", year: "2003", platforms: ["xbox_original", "pc"], platNames: ["Xbox", "PC"] },
    { title: "Star Wars: Battlefront II", year: "2005", platforms: ["ps2", "xbox_original", "pc"], platNames: ["PlayStation 2", "Xbox", "PC"] },
    { title: "Star Wars Jedi: Fallen Order", year: "2019", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Star Wars Jedi: Survivor", year: "2023", platforms: ["ps5", "xbox_series_xs", "pc"], platNames: ["PlayStation 5", "Xbox Series X|S", "PC"] },
  ],

  "Hollow Knight": [
    { title: "Hollow Knight", year: "2017", platforms: ["switch_1", "pc", "ps4"], platNames: ["Nintendo Switch", "PC", "PlayStation 4"] },
    { title: "Hollow Knight: Silksong", year: "TBA", platforms: ["switch_1", "pc", "ps5"], platNames: ["Nintendo Switch", "PC", "PlayStation 5"] },
  ],

  "Hades": [
    { title: "Hades", year: "2020", platforms: ["switch_1", "pc", "ps4", "ps5"], platNames: ["Nintendo Switch", "PC", "PlayStation 4", "PlayStation 5"] },
    { title: "Hades II", year: "2024", platforms: ["pc"], platNames: ["PC"] },
  ],

  "Elden Ring": [
    { title: "Elden Ring", year: "2022", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
  ],

  "Sonic the Hedgehog": [
    { title: "Sonic the Hedgehog (1991)", year: "1991", platforms: ["genesis"], platNames: ["Sega Genesis"] },
    { title: "Sonic the Hedgehog 2", year: "1992", platforms: ["genesis"], platNames: ["Sega Genesis"] },
    { title: "Sonic CD", year: "1993", platforms: ["sega_cd"], platNames: ["Sega CD"] },
    { title: "Sonic the Hedgehog 3", year: "1994", platforms: ["genesis"], platNames: ["Sega Genesis"] },
    { title: "Sonic & Knuckles", year: "1994", platforms: ["genesis"], platNames: ["Sega Genesis"] },
    { title: "Sonic Adventure", year: "1998", platforms: ["dreamcast"], platNames: ["Dreamcast"] },
    { title: "Sonic Adventure 2", year: "2001", platforms: ["dreamcast", "gamecube"], platNames: ["Dreamcast", "GameCube"] },
    { title: "Sonic Heroes", year: "2003", platforms: ["gamecube", "ps2", "xbox_original"], platNames: ["GameCube", "PlayStation 2", "Xbox"] },
    { title: "Sonic the Hedgehog (2006)", year: "2006", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "Sonic Unleashed", year: "2008", platforms: ["ps3", "xbox_360", "wii"], platNames: ["PlayStation 3", "Xbox 360", "Wii"] },
    { title: "Sonic Colors", year: "2010", platforms: ["wii"], platNames: ["Wii"] },
    { title: "Sonic Generations", year: "2011", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Sonic Lost World", year: "2013", platforms: ["wii_u", "3ds"], platNames: ["Wii U", "Nintendo 3DS"] },
    { title: "Sonic Mania", year: "2017", platforms: ["switch_1", "ps4", "xbox_one", "pc"], platNames: ["Nintendo Switch", "PlayStation 4", "Xbox One", "PC"] },
    { title: "Sonic Frontiers", year: "2022", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "switch_1", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "Nintendo Switch", "PC"] },
    { title: "Sonic X Shadow Generations", year: "2024", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "switch_1", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "Nintendo Switch", "PC"] },
  ],

  "Mega Man": [
    { title: "Mega Man (1987)", year: "1987", platforms: ["nes"], platNames: ["NES"] },
    { title: "Mega Man 2 (1988)", year: "1988", platforms: ["nes"], platNames: ["NES"] },
    { title: "Mega Man 3 (1990)", year: "1990", platforms: ["nes"], platNames: ["NES"] },
    { title: "Mega Man 4 (1991)", year: "1991", platforms: ["nes"], platNames: ["NES"] },
    { title: "Mega Man 5 (1992)", year: "1992", platforms: ["nes"], platNames: ["NES"] },
    { title: "Mega Man 6 (1993)", year: "1993", platforms: ["nes"], platNames: ["NES"] },
    { title: "Mega Man 7", year: "1995", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Mega Man 8", year: "1996", platforms: ["ps1", "sega_saturn"], platNames: ["PlayStation", "Sega Saturn"] },
    { title: "Mega Man 9", year: "2008", platforms: ["ps3", "xbox_360", "wii"], platNames: ["PlayStation 3", "Xbox 360", "Wii"] },
    { title: "Mega Man 10", year: "2010", platforms: ["ps3", "xbox_360", "wii"], platNames: ["PlayStation 3", "Xbox 360", "Wii"] },
    { title: "Mega Man 11", year: "2018", platforms: ["ps4", "xbox_one", "switch_1", "pc"], platNames: ["PlayStation 4", "Xbox One", "Nintendo Switch", "PC"] },
    { title: "Mega Man X", year: "1993", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Mega Man X2", year: "1994", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Mega Man X3", year: "1995", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Mega Man X4 (1997)", year: "1997", platforms: ["ps1", "sega_saturn"], platNames: ["PlayStation", "Sega Saturn"] },
    { title: "Mega Man X5", year: "2000", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Mega Man X6", year: "2001", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Mega Man X7", year: "2003", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Mega Man X8", year: "2004", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Mega Man Zero", year: "2002", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Mega Man Zero 2", year: "2003", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Mega Man Zero 3", year: "2004", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Mega Man Zero 4", year: "2005", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Mega Man Battle Network", year: "2001", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Mega Man Battle Network 2", year: "2001", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Mega Man Battle Network 3", year: "2002", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Mega Man Battle Network 4", year: "2003", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Mega Man Battle Network 5", year: "2004", platforms: ["gba", "ds"], platNames: ["Game Boy Advance", "Nintendo DS"] },
    { title: "Mega Man Battle Network 6", year: "2005", platforms: ["gba"], platNames: ["Game Boy Advance"] },
  ],

  "Street Fighter": [
    { title: "Street Fighter (1987)", year: "1987", platforms: ["arcade"], platNames: ["Arcade"] },
    { title: "Street Fighter II: The World Warrior (1991)", year: "1991", platforms: ["arcade", "snes"], platNames: ["Arcade", "SNES"] },
    { title: "Street Fighter II Turbo: Hyper Fighting", year: "1992", platforms: ["arcade", "snes"], platNames: ["Arcade", "SNES"] },
    { title: "Super Street Fighter II", year: "1993", platforms: ["arcade", "snes"], platNames: ["Arcade", "SNES"] },
    { title: "Street Fighter Alpha (1995)", year: "1995", platforms: ["arcade", "ps1", "snes"], platNames: ["Arcade", "PlayStation", "SNES"] },
    { title: "Street Fighter Alpha 2", year: "1996", platforms: ["arcade", "ps1", "snes"], platNames: ["Arcade", "PlayStation", "SNES"] },
    { title: "Street Fighter III: 3rd Strike", year: "1999", platforms: ["arcade", "dreamcast"], platNames: ["Arcade", "Dreamcast"] },
    { title: "Street Fighter IV", year: "2008", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Super Street Fighter IV", year: "2010", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Street Fighter V", year: "2016", platforms: ["ps4", "pc"], platNames: ["PlayStation 4", "PC"] },
    { title: "Street Fighter 6", year: "2023", platforms: ["ps4", "ps5", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox Series X|S", "PC"] },
  ],

  "Tomb Raider": [
    { title: "Tomb Raider (1996)", year: "1996", platforms: ["ps1", "sega_saturn", "pc"], platNames: ["PlayStation", "Sega Saturn", "PC"] },
    { title: "Tomb Raider II", year: "1997", platforms: ["ps1", "pc"], platNames: ["PlayStation", "PC"] },
    { title: "Tomb Raider III", year: "1998", platforms: ["ps1", "pc"], platNames: ["PlayStation", "PC"] },
    { title: "Tomb Raider: The Last Revelation", year: "1999", platforms: ["ps1", "pc"], platNames: ["PlayStation", "PC"] },
    { title: "Tomb Raider: Chronicles", year: "2000", platforms: ["ps1", "pc"], platNames: ["PlayStation", "PC"] },
    { title: "Tomb Raider: Legend", year: "2006", platforms: ["ps2", "xbox_360", "pc"], platNames: ["PlayStation 2", "Xbox 360", "PC"] },
    { title: "Tomb Raider: Anniversary", year: "2007", platforms: ["ps2", "xbox_360", "pc"], platNames: ["PlayStation 2", "Xbox 360", "PC"] },
    { title: "Tomb Raider: Underworld", year: "2008", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Tomb Raider (2013)", year: "2013", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Rise of the Tomb Raider", year: "2015", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Shadow of the Tomb Raider", year: "2018", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "Mortal Kombat": [
    { title: "Mortal Kombat (1992)", year: "1992", platforms: ["arcade", "snes", "genesis"], platNames: ["Arcade", "SNES", "Sega Genesis"] },
    { title: "Mortal Kombat II", year: "1993", platforms: ["arcade", "snes", "genesis"], platNames: ["Arcade", "SNES", "Sega Genesis"] },
    { title: "Mortal Kombat 3", year: "1995", platforms: ["arcade", "snes", "genesis"], platNames: ["Arcade", "SNES", "Sega Genesis"] },
    { title: "Mortal Kombat 4", year: "1997", platforms: ["arcade", "ps1", "n64"], platNames: ["Arcade", "PlayStation", "Nintendo 64"] },
    { title: "Mortal Kombat: Deadly Alliance", year: "2002", platforms: ["ps2", "xbox_original", "gamecube"], platNames: ["PlayStation 2", "Xbox", "GameCube"] },
    { title: "Mortal Kombat: Deception", year: "2004", platforms: ["ps2", "xbox_original", "gamecube"], platNames: ["PlayStation 2", "Xbox", "GameCube"] },
    { title: "Mortal Kombat: Armageddon", year: "2006", platforms: ["ps2", "xbox_original"], platNames: ["PlayStation 2", "Xbox"] },
    { title: "Mortal Kombat (2011)", year: "2011", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Mortal Kombat X", year: "2015", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Mortal Kombat 11", year: "2019", platforms: ["ps4", "xbox_one", "pc", "switch_1"], platNames: ["PlayStation 4", "Xbox One", "PC", "Nintendo Switch"] },
    { title: "Mortal Kombat 1", year: "2023", platforms: ["ps5", "xbox_series_xs", "pc", "switch_1"], platNames: ["PlayStation 5", "Xbox Series X|S", "PC", "Nintendo Switch"] },
  ],

  "Tekken": [
    { title: "Tekken", year: "1994", platforms: ["arcade", "ps1"], platNames: ["Arcade", "PlayStation"] },
    { title: "Tekken 2", year: "1995", platforms: ["arcade", "ps1"], platNames: ["Arcade", "PlayStation"] },
    { title: "Tekken 3", year: "1997", platforms: ["arcade", "ps1"], platNames: ["Arcade", "PlayStation"] },
    { title: "Tekken Tag Tournament", year: "1999", platforms: ["arcade", "ps2"], platNames: ["Arcade", "PlayStation 2"] },
    { title: "Tekken 4", year: "2001", platforms: ["arcade", "ps2"], platNames: ["Arcade", "PlayStation 2"] },
    { title: "Tekken 5", year: "2004", platforms: ["arcade", "ps2"], platNames: ["Arcade", "PlayStation 2"] },
    { title: "Tekken 6", year: "2007", platforms: ["arcade", "ps3", "xbox_360", "psp"], platNames: ["Arcade", "PlayStation 3", "Xbox 360", "PSP"] },
    { title: "Tekken 7", year: "2015", platforms: ["arcade", "ps4", "xbox_one", "pc"], platNames: ["Arcade", "PlayStation 4", "Xbox One", "PC"] },
    { title: "Tekken 8", year: "2024", platforms: ["ps5", "xbox_series_xs", "pc"], platNames: ["PlayStation 5", "Xbox Series X|S", "PC"] },
  ],

  "Castlevania": [
    { title: "Castlevania (1986)", year: "1986", platforms: ["nes"], platNames: ["NES"] },
    { title: "Castlevania II: Simon's Quest", year: "1987", platforms: ["nes"], platNames: ["NES"] },
    { title: "Castlevania III: Dracula's Curse", year: "1989", platforms: ["nes"], platNames: ["NES"] },
    { title: "Super Castlevania IV", year: "1991", platforms: ["snes"], platNames: ["SNES"] },
    { title: "Castlevania: Rondo of Blood", year: "1993", platforms: ["pc_engine"], platNames: ["PC Engine"] },
    { title: "Castlevania: Symphony of the Night", year: "1997", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Castlevania: Circle of the Moon", year: "2001", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Castlevania: Harmony of Dissonance", year: "2002", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Castlevania: Aria of Sorrow", year: "2003", platforms: ["gba"], platNames: ["Game Boy Advance"] },
    { title: "Castlevania: Lament of Innocence", year: "2003", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Castlevania: Dawn of Sorrow", year: "2005", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "Castlevania: Portrait of Ruin", year: "2006", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "Castlevania: Order of Ecclesia", year: "2008", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "Castlevania: Lords of Shadow", year: "2010", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Castlevania: Lords of Shadow 2", year: "2014", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
  ],

  "Hitman": [
    { title: "Hitman: Codename 47", year: "2000", platforms: ["pc"], platNames: ["PC"] },
    { title: "Hitman 2: Silent Assassin", year: "2002", platforms: ["ps2", "xbox_original", "pc"], platNames: ["PlayStation 2", "Xbox", "PC"] },
    { title: "Hitman: Contracts", year: "2004", platforms: ["ps2", "xbox_original", "pc"], platNames: ["PlayStation 2", "Xbox", "PC"] },
    { title: "Hitman: Blood Money", year: "2006", platforms: ["ps2", "xbox_original", "pc"], platNames: ["PlayStation 2", "Xbox", "PC"] },
    { title: "Hitman: Absolution", year: "2012", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Hitman (2016)", year: "2016", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Hitman 2 (2018)", year: "2018", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Hitman 3", year: "2021", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
  ],

  "Monster Hunter": [
    { title: "Monster Hunter", year: "2004", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Monster Hunter Freedom", year: "2005", platforms: ["psp"], platNames: ["PSP"] },
    { title: "Monster Hunter 2", year: "2006", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Monster Hunter Freedom 2", year: "2007", platforms: ["psp"], platNames: ["PSP"] },
    { title: "Monster Hunter Freedom Unite", year: "2008", platforms: ["psp"], platNames: ["PSP"] },
    { title: "Monster Hunter Tri", year: "2009", platforms: ["wii"], platNames: ["Wii"] },
    { title: "Monster Hunter Portable 3rd", year: "2010", platforms: ["psp"], platNames: ["PSP"] },
    { title: "Monster Hunter 3 Ultimate", year: "2011", platforms: ["3ds", "wii_u"], platNames: ["Nintendo 3DS", "Wii U"] },
    { title: "Monster Hunter 4", year: "2013", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "Monster Hunter 4 Ultimate", year: "2014", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "Monster Hunter Generations", year: "2015", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "Monster Hunter World", year: "2018", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Monster Hunter Rise", year: "2021", platforms: ["switch_1", "pc", "ps4", "xbox_one"], platNames: ["Nintendo Switch", "PC", "PlayStation 4", "Xbox One"] },
    { title: "Monster Hunter Wilds", year: "2025", platforms: ["ps5", "xbox_series_xs", "pc"], platNames: ["PlayStation 5", "Xbox Series X|S", "PC"] },
  ],

  "Yakuza": [
    { title: "Yakuza (2005)", year: "2005", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Yakuza 2", year: "2006", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Yakuza 3", year: "2009", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Yakuza 4", year: "2010", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Yakuza 5", year: "2012", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Yakuza 0", year: "2015", platforms: ["ps3", "ps4", "pc"], platNames: ["PlayStation 3", "PlayStation 4", "PC"] },
    { title: "Yakuza 6: The Song of Life", year: "2016", platforms: ["ps4", "pc"], platNames: ["PlayStation 4", "PC"] },
    { title: "Yakuza Kiwami", year: "2016", platforms: ["ps4", "pc", "xbox_one"], platNames: ["PlayStation 4", "PC", "Xbox One"] },
    { title: "Yakuza Kiwami 2", year: "2017", platforms: ["ps4", "pc", "xbox_one"], platNames: ["PlayStation 4", "PC", "Xbox One"] },
    { title: "Yakuza: Like a Dragon", year: "2020", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
    { title: "Like a Dragon: Ishin!", year: "2023", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
    { title: "Like a Dragon: Infinite Wealth", year: "2024", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
    { title: "Like a Dragon: Pirate Yakuza in Hawaii", year: "2025", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
  ],

  "Dragon Age": [
    { title: "Dragon Age: Origins", year: "2009", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Dragon Age II", year: "2011", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Dragon Age: Inquisition", year: "2014", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Dragon Age: The Veilguard", year: "2024", platforms: ["ps5", "xbox_series_xs", "pc"], platNames: ["PlayStation 5", "Xbox Series X|S", "PC"] },
  ],

  "Half-Life": [
    { title: "Half-Life", year: "1998", platforms: ["pc"], platNames: ["PC"] },
    { title: "Half-Life 2", year: "2004", platforms: ["pc", "xbox_original"], platNames: ["PC", "Xbox"] },
    { title: "Half-Life 2: Episode One", year: "2006", platforms: ["pc"], platNames: ["PC"] },
    { title: "Half-Life 2: Episode Two", year: "2007", platforms: ["pc"], platNames: ["PC"] },
    { title: "Half-Life: Alyx", year: "2020", platforms: ["pc"], platNames: ["PC"] },
  ],

  "Portal": [
    { title: "Portal", year: "2007", platforms: ["pc", "ps3", "xbox_360"], platNames: ["PC", "PlayStation 3", "Xbox 360"] },
    { title: "Portal 2", year: "2011", platforms: ["pc", "ps3", "xbox_360"], platNames: ["PC", "PlayStation 3", "Xbox 360"] },
  ],

  "Wolfenstein": [
    { title: "Wolfenstein 3D", year: "1992", platforms: ["pc"], platNames: ["PC"] },
    { title: "Return to Castle Wolfenstein", year: "2001", platforms: ["pc", "ps2", "xbox_original"], platNames: ["PC", "PlayStation 2", "Xbox"] },
    { title: "Wolfenstein (2009)", year: "2009", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Wolfenstein: The New Order", year: "2014", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Wolfenstein: The Old Blood", year: "2015", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Wolfenstein II: The New Colossus", year: "2017", platforms: ["ps4", "xbox_one", "pc", "switch_1"], platNames: ["PlayStation 4", "Xbox One", "PC", "Nintendo Switch"] },
    { title: "Wolfenstein: Youngblood", year: "2019", platforms: ["ps4", "xbox_one", "pc", "switch_1"], platNames: ["PlayStation 4", "Xbox One", "PC", "Nintendo Switch"] },
  ],

  "Dishonored": [
    { title: "Dishonored", year: "2012", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
    { title: "Dishonored 2", year: "2016", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Dishonored: Death of the Outsider", year: "2017", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
  ],

  "Crash Bandicoot": [
    { title: "Crash Bandicoot", year: "1996", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Crash Bandicoot 2: Cortex Strikes Back", year: "1997", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Crash Bandicoot 3: Warped", year: "1998", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Crash Team Racing", year: "1999", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Crash Bash", year: "2000", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Crash Bandicoot: The Wrath of Cortex", year: "2001", platforms: ["ps2", "xbox_original", "gamecube"], platNames: ["PlayStation 2", "Xbox", "GameCube"] },
    { title: "Crash Bandicoot: Twinsanity", year: "2004", platforms: ["ps2", "xbox_original"], platNames: ["PlayStation 2", "Xbox"] },
    { title: "Crash Bandicoot N. Sane Trilogy", year: "2017", platforms: ["ps4", "xbox_one", "switch_1", "pc"], platNames: ["PlayStation 4", "Xbox One", "Nintendo Switch", "PC"] },
    { title: "Crash Team Racing Nitro-Fueled", year: "2019", platforms: ["ps4", "xbox_one", "switch_1"], platNames: ["PlayStation 4", "Xbox One", "Nintendo Switch"] },
    { title: "Crash Bandicoot 4: It's About Time", year: "2020", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc", "switch_1"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC", "Nintendo Switch"] },
  ],

  "Spyro the Dragon": [
    { title: "Spyro the Dragon", year: "1998", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Spyro 2: Ripto's Rage!", year: "1999", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Spyro: Year of the Dragon", year: "2000", platforms: ["ps1"], platNames: ["PlayStation"] },
    { title: "Spyro: Enter the Dragonfly", year: "2002", platforms: ["ps2", "gamecube"], platNames: ["PlayStation 2", "GameCube"] },
    { title: "Spyro: A Hero's Tail", year: "2004", platforms: ["ps2", "xbox_original", "gamecube"], platNames: ["PlayStation 2", "Xbox", "GameCube"] },
    { title: "Spyro Reignited Trilogy", year: "2018", platforms: ["ps4", "xbox_one", "switch_1", "pc"], platNames: ["PlayStation 4", "Xbox One", "Nintendo Switch", "PC"] },
  ],

  "Ratchet & Clank": [
    { title: "Ratchet & Clank (2002)", year: "2002", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Ratchet & Clank: Going Commando", year: "2003", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Ratchet & Clank: Up Your Arsenal", year: "2004", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Ratchet: Deadlocked", year: "2005", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Ratchet & Clank: Tools of Destruction", year: "2007", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Ratchet & Clank: A Crack in Time", year: "2009", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Ratchet & Clank: Into the Nexus", year: "2013", platforms: ["ps3"], platNames: ["PlayStation 3"] },
    { title: "Ratchet & Clank (2016)", year: "2016", platforms: ["ps4"], platNames: ["PlayStation 4"] },
    { title: "Ratchet & Clank: Rift Apart", year: "2021", platforms: ["ps5", "pc"], platNames: ["PlayStation 5", "PC"] },
  ],

  "Animal Crossing": [
    { title: "Animal Crossing", year: "2001", platforms: ["gamecube"], platNames: ["GameCube"] },
    { title: "Animal Crossing: Wild World", year: "2005", platforms: ["ds"], platNames: ["Nintendo DS"] },
    { title: "Animal Crossing: City Folk", year: "2008", platforms: ["wii"], platNames: ["Wii"] },
    { title: "Animal Crossing: New Leaf", year: "2012", platforms: ["3ds"], platNames: ["Nintendo 3DS"] },
    { title: "Animal Crossing: New Horizons", year: "2020", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
  ],

  "Xenoblade Chronicles": [
    { title: "Xenoblade Chronicles", year: "2010", platforms: ["wii", "3ds"], platNames: ["Wii", "Nintendo 3DS"] },
    { title: "Xenoblade Chronicles X", year: "2015", platforms: ["wii_u"], platNames: ["Wii U"] },
    { title: "Xenoblade Chronicles 2", year: "2017", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Xenoblade Chronicles 3", year: "2022", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
  ],

  "Splatoon": [
    { title: "Splatoon", year: "2015", platforms: ["wii_u"], platNames: ["Wii U"] },
    { title: "Splatoon 2", year: "2017", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Splatoon 3", year: "2022", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
  ],

  "Bayonetta": [
    { title: "Bayonetta", year: "2009", platforms: ["ps3", "xbox_360", "pc", "switch_1"], platNames: ["PlayStation 3", "Xbox 360", "PC", "Nintendo Switch"] },
    { title: "Bayonetta 2", year: "2014", platforms: ["wii_u", "switch_1"], platNames: ["Wii U", "Nintendo Switch"] },
    { title: "Bayonetta 3", year: "2022", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
    { title: "Bayonetta Origins: Cereza and the Lost Demon", year: "2023", platforms: ["switch_1"], platNames: ["Nintendo Switch"] },
  ],

  "Life is Strange": [
    { title: "Life is Strange", year: "2015", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Life is Strange: Before the Storm", year: "2017", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Life is Strange 2", year: "2018", platforms: ["ps4", "xbox_one", "pc"], platNames: ["PlayStation 4", "Xbox One", "PC"] },
    { title: "Life is Strange: True Colors", year: "2021", platforms: ["ps4", "ps5", "xbox_one", "xbox_series_xs", "pc"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox One", "Xbox Series X|S", "PC"] },
    { title: "Life is Strange: Double Exposure", year: "2024", platforms: ["ps5", "xbox_series_xs", "pc"], platNames: ["PlayStation 5", "Xbox Series X|S", "PC"] },
  ],

  "The Last of Us": [
    { title: "The Last of Us", year: "2013", platforms: ["ps3", "ps4"], platNames: ["PlayStation 3", "PlayStation 4"] },
    { title: "The Last of Us: Left Behind", year: "2014", platforms: ["ps3", "ps4"], platNames: ["PlayStation 3", "PlayStation 4"] },
    { title: "The Last of Us Part II", year: "2020", platforms: ["ps4", "ps5"], platNames: ["PlayStation 4", "PlayStation 5"] },
  ],

  "Ghost of Tsushima": [
    { title: "Ghost of Tsushima", year: "2020", platforms: ["ps4", "ps5"], platNames: ["PlayStation 4", "PlayStation 5"] },
    { title: "Ghost of Tsushima: Legends", year: "2020", platforms: ["ps4", "ps5"], platNames: ["PlayStation 4", "PlayStation 5"] },
  ],

  "NieR": [
    { title: "NieR Replicant", year: "2010", platforms: ["ps3", "xbox_360"], platNames: ["PlayStation 3", "Xbox 360"] },
    { title: "NieR: Automata", year: "2017", platforms: ["ps4", "pc", "xbox_one", "switch_1"], platNames: ["PlayStation 4", "PC", "Xbox One", "Nintendo Switch"] },
  ],

  "Fatal Frame": [
    { title: "Fatal Frame", year: "2001", platforms: ["ps2", "xbox_original"], platNames: ["PlayStation 2", "Xbox"] },
    { title: "Fatal Frame II: Crimson Butterfly", year: "2003", platforms: ["ps2", "xbox_original"], platNames: ["PlayStation 2", "Xbox"] },
    { title: "Fatal Frame III: The Tormented", year: "2005", platforms: ["ps2"], platNames: ["PlayStation 2"] },
    { title: "Fatal Frame: Maiden of Black Water", year: "2014", platforms: ["wii_u", "ps4", "ps5", "xbox_series_xs", "pc"], platNames: ["Wii U", "PlayStation 4", "PlayStation 5", "Xbox Series X|S", "PC"] },
    { title: "Fatal Frame: Mask of the Lunar Eclipse", year: "2023", platforms: ["ps4", "ps5", "xbox_series_xs", "pc", "switch_1"], platNames: ["PlayStation 4", "PlayStation 5", "Xbox Series X|S", "PC", "Nintendo Switch"] },
  ],

  "Dead Rising": [
    { title: "Dead Rising", year: "2006", platforms: ["xbox_360", "ps4", "pc"], platNames: ["Xbox 360", "PlayStation 4", "PC"] },
    { title: "Dead Rising 2", year: "2010", platforms: ["xbox_360", "ps3", "pc"], platNames: ["Xbox 360", "PlayStation 3", "PC"] },
    { title: "Dead Rising 3", year: "2013", platforms: ["xbox_one", "pc"], platNames: ["Xbox One", "PC"] },
    { title: "Dead Rising 4", year: "2016", platforms: ["xbox_one", "ps4", "pc"], platNames: ["Xbox One", "PlayStation 4", "PC"] },
  ],

  "Max Payne": [
    { title: "Max Payne", year: "2001", platforms: ["pc", "ps2", "xbox_original"], platNames: ["PC", "PlayStation 2", "Xbox"] },
    { title: "Max Payne 2: The Fall of Max Payne", year: "2003", platforms: ["pc", "ps2", "xbox_original"], platNames: ["PC", "PlayStation 2", "Xbox"] },
    { title: "Max Payne 3", year: "2012", platforms: ["ps3", "xbox_360", "pc"], platNames: ["PlayStation 3", "Xbox 360", "PC"] },
  ],

};

async function main() {
  // Load existing games
  const { data: existingGames, error } = await supabase.from("games").select("game_id, title");
  if (error) throw error;

  const existingByNorm = new Map();
  for (const g of existingGames) {
    existingByNorm.set(normalize(g.title), g);
  }

  const updates = [];   // games to update (add series)
  const inserts = [];   // games to insert new

  for (const [series, games] of Object.entries(SERIES)) {
    for (const game of games) {
      const key = normalize(game.title);
      const existing = existingByNorm.get(key);

      if (existing) {
        // Game exists — add to update list
        updates.push({
          game_id: existing.game_id,
          series,
        });
      } else {
        // Game missing — create insert with unique ID
        const baseSlug = `catalog_${slugify(game.title)}`;
        let gameId = baseSlug;
        let counter = 1;
        while (inserts.some(g => g.game_id === gameId)) {
          gameId = `${baseSlug}_${counter}`;
          counter++;
        }
        const seriesId = slugify(series);
        inserts.push({
          game_id: gameId,
          title: game.title,
          aliases: [],
          series_id: seriesId,
          release_year: game.year,
          release_state: game.year && game.year !== "TBA" && game.year.length === 4 ? "released" : "unreleased",
          source_type: "catalog",
          source_ref: "",
          cover_url: "",
          tags: [],
          notes: "Added via enrich-series script",
          sort_date: "",
          release_label: "",
        });
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Games to UPDATE (add series): ${updates.length}`);
  console.log(`Games to INSERT (new): ${inserts.length}`);

  // Show per-series breakdown
  for (const [series, games] of Object.entries(SERIES)) {
    const toUpdate = games.filter(g => existingByNorm.has(normalize(g.title)));
    const toInsert = games.filter(g => !existingByNorm.has(normalize(g.title)));
    console.log(`\n${series}: ${toUpdate.length} existing + ${toInsert.length} missing`);
    if (toInsert.length > 0) {
      for (const g of toInsert) {
        console.log(`  ➕ INSERT: ${g.title} (${g.year})`);
      }
    }
  }

  // ── Apply changes ──
  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write to database.");
    return;
  }

  // Batch update series
  if (updates.length > 0) {
    console.log(`\nUpdating ${updates.length} games with series...`);
    const BATCH = 100;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      for (const u of batch) {
        const seriesId = slugify(u.series);
        await supabase.from("series").upsert(
          { id: seriesId, name: u.series },
          { onConflict: "id", ignoreDuplicates: true },
        );
      }
      const results = await Promise.all(
        batch.map((u) => {
          const seriesId = slugify(u.series);
          return supabase.from("games").update({ series_id: seriesId }).eq("game_id", u.game_id);
        })
      );
      const errs = results.filter(r => r.error);
      if (errs.length > 0) console.error("  Errors:", errs[0].error.message);
      console.log(`  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(updates.length / BATCH)} OK`);
    }
  }

  // Insert new games
  if (inserts.length > 0) {
    console.log(`\nInserting ${inserts.length} new games...`);
    const BATCH = 100;
    for (let i = 0; i < inserts.length; i += BATCH) {
      const batch = inserts.slice(i, i + BATCH);
      // Ensure all referenced series exist
      for (const u of batch) {
        if (u.series) {
          const seriesId = slugify(u.series);
          await supabase.from("series").upsert(
            { id: seriesId, name: u.series },
            { onConflict: "id", ignoreDuplicates: true },
          );
        }
      }
      // Add series_id to batch items
      const enriched = batch.map((u) => ({
        ...u,
        series_id: u.series ? slugify(u.series) : null,
      }));
      const { error } = await supabase.from("games").upsert(enriched, { onConflict: "game_id" });
      if (error) {
        console.error(`  Batch ${Math.floor(i / BATCH) + 1}: ERROR ${error.message}`);
      } else {
        console.log(`  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(inserts.length / BATCH)} OK`);
      }
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);

import { describe, expect, it } from "vitest";
import { matchPeople, namesFromFilename, parseTicketText } from "./ticketParse";

// Shapes taken from real redBus e-tickets (bold text comes through doubled).
const group = `Ticket Ticket Information Information Tirupur-Chennai Tirupur-Chennai on on Saturday, October Saturday, October 17, 2026 17, 2026
Ticket Number: TVB326227448 TVB326227448 | PNR No: JKSQA7M524386 JKSQA7M524386 Hey arunika,
Journey Date and Time 17/10/2026, 10:30 PM 17/10/2026, 10:30 PM Travels Ticket Price
Passenger Details Seat no arunika arunika 19Yrs, FEMALE U5
alex alex 20Yrs, MALE 12 Sai Karthi Balaji Sai Karthi Balaji 20Yrs, MALE U6W
dheeksha dheeksha 21Yrs, FEMALE 11W
Jisnu Jisnu 21Yrs, MALE 10W
Jaii Jaii 15Yrs, MALE 9
Chennai Chennai Near Bus Stop Kelampakkam DROPPING DATE & TIME: 18/10/2026, 05:25 AM 18/10/2026, 05:25 AM`;

const single = `Ticket Information Chennai-Tirupur on Sunday, October 18, 2026 Ticket Number: TVB463137664 | PNR No: MANQA8L38T296
Hey Jisnu, Passenger Details Seat no Jisnu 21Yrs, MALE U10 Congrats on booking a Primo bus!
Ticket Details Journey Date and Time 18/10/2026, 09:55 PM Travels
Tirupur Near Bypass DROPPING DATE & TIME: 19/10/2026, 05:41 AM`;

describe("parseTicketText", () => {
  it("reads a group ticket", () => {
    const t = parseTicketText(group);
    expect(t.fromPlace).toBe("Tirupur");
    expect(t.toPlace).toBe("Chennai");
    expect(t.departsOn).toBe("2026-10-17");
    expect(t.departsAt).toBe("22:30");
    expect(t.reference).toBe("TVB326227448, PNR JKSQA7M524386");
    expect(t.passengers).toEqual([
      { name: "arunika", seat: "U5" }, { name: "alex", seat: "12" }, { name: "Sai Karthi Balaji", seat: "U6W" },
      { name: "dheeksha", seat: "11W" }, { name: "Jisnu", seat: "10W" }, { name: "Jaii", seat: "9" },
    ]);
  });
  it("reads a single ticket and takes the journey time, not the drop time", () => {
    const t = parseTicketText(single);
    expect([t.fromPlace, t.toPlace, t.departsOn, t.departsAt]).toEqual(["Chennai", "Tirupur", "2026-10-18", "21:55"]);
    expect(t.passengers).toEqual([{ name: "Jisnu", seat: "U10" }]);
  });
  it("handles 12 AM / 12 PM and never keeps age or gender", () => {
    expect(parseTicketText("Journey Date and Time 01/11/2026, 12:05 AM").departsAt).toBe("00:05");
    expect(parseTicketText("Journey Date and Time 01/11/2026, 12:05 PM").departsAt).toBe("12:05");
    expect(JSON.stringify(parseTicketText(group))).not.toMatch(/Yrs|MALE|15/);
  });
  it("returns empty fields for text it doesn't recognise", () => {
    expect(parseTicketText("Boarding pass. Gate 4.")).toEqual({ fromPlace: "", toPlace: "", departsOn: null, departsAt: null, reference: "", passengers: [] });
  });
});

describe("matching people", () => {
  const people = [{ id: "1", name: "Jisnu" }, { id: "2", name: "Sai" }, { id: "3", name: "Arunika R" }, { id: "4", name: "Jai" }, { id: "5", name: "Al" }, { id: "6", name: "Arun" }];
  it("matches by full name and first name, and tolerates one trailing letter", () => {
    expect(matchPeople(["Jisnu", "Sai Karthi Balaji", "arunika", "nobody"], people).sort()).toEqual(["1", "2", "3"]);
    expect(matchPeople(["Jaii"], people)).toEqual(["4"]);
    expect(matchPeople(["alex"], people)).toEqual([]); // "Al" is too short to guess from
    expect(matchPeople(["arunika"], [{ id: "6", name: "Arun" }])).toEqual([]); // different people
    expect(matchPeople(["arun"], people)).toEqual(["6"]);
    expect(matchPeople(["akilesh"], [{ id: "9", name: "Akhilesh" }])).toEqual(["9"]); // one letter out
    expect(matchPeople(["ashwin vignesh"], [{ id: "8", name: "Ashwin vignesh" }])).toEqual(["8"]);
    expect(matchPeople(["dharneesh"], [{ id: "7", name: "Dheeksha" }])).toEqual([]);
  });
  it("pulls names out of a file name", () => {
    expect(namesFromFilename("arunika-alex-sai-dheeksha-jaii-jisnu-TVB326227448.pdf")).toEqual(["arunika", "alex", "sai", "dheeksha", "jaii", "jisnu"]);
    expect(namesFromFilename("Dharneesh-TVB683442295.pdf")).toEqual(["Dharneesh"]);
  });
});

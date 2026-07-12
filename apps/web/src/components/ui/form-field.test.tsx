import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormControl, FormField, FormLabel, FormMessage } from "./form-field";
import { Input } from "./input";

describe("FormField", () => {
  it("connects a control to its message with aria-describedby", () => {
    render(
      <FormField>
        <FormLabel htmlFor="email">Email</FormLabel>
        <FormControl>
          <Input id="email" />
        </FormControl>
        <FormMessage>Enter a valid email address.</FormMessage>
      </FormField>,
    );

    const input = screen.getByRole("textbox", { name: "Email" });
    const message = screen.getByText("Enter a valid email address.");
    expect(input).toHaveAttribute("aria-describedby", message.id);
  });
});

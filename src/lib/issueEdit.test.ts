import { describe, it, expect } from "vitest";
import {
  draftFromIssue,
  isDirty,
  diffIssueEdit,
  type IssueDraft,
} from "./issueEdit";

const issue = {
  title: "Bug",
  description: "desc",
  state: "opened",
  labels: { nodes: [{ id: "l1" }, { id: "l2" }] },
  assignees: { nodes: [{ username: "ada" }] },
};

const base = (): IssueDraft => draftFromIssue(issue);

describe("issueEdit", () => {
  it("draftFromIssue maps fields, ids, usernames; null description -> ''", () => {
    expect(base()).toEqual({
      title: "Bug",
      description: "desc",
      state: "opened",
      labelIds: ["l1", "l2"],
      assigneeUsernames: ["ada"],
    });
    expect(draftFromIssue({ ...issue, description: null }).description).toBe(
      "",
    );
  });

  it("isDirty is false for an identical draft, true on any field change", () => {
    expect(isDirty(base(), base())).toBe(false);
    expect(isDirty(base(), { ...base(), title: "X" })).toBe(true);
    expect(isDirty(base(), { ...base(), labelIds: ["l1"] })).toBe(true);
    expect(isDirty(base(), { ...base(), assigneeUsernames: [] })).toBe(true);
  });

  it("isDirty ignores label/assignee ordering", () => {
    expect(isDirty(base(), { ...base(), labelIds: ["l2", "l1"] })).toBe(false);
  });

  it("diff returns {} when clean", () => {
    expect(diffIssueEdit(base(), base())).toEqual({});
  });

  it("diff emits title/description changes", () => {
    expect(
      diffIssueEdit(base(), { ...base(), title: "New", description: "d2" }),
    ).toEqual({ update: { title: "New", description: "d2" } });
  });

  it("diff maps state opened->closed to CLOSE and closed->opened to REOPEN", () => {
    expect(diffIssueEdit(base(), { ...base(), state: "closed" })).toEqual({
      update: { stateEvent: "CLOSE" },
    });
    const closed: IssueDraft = { ...base(), state: "closed" };
    expect(diffIssueEdit(closed, { ...closed, state: "opened" })).toEqual({
      update: { stateEvent: "REOPEN" },
    });
  });

  it("diff computes label add/remove deltas", () => {
    expect(
      diffIssueEdit(base(), { ...base(), labelIds: ["l2", "l3"] }),
    ).toEqual({ update: { addLabelIds: ["l3"], removeLabelIds: ["l1"] } });
  });

  it("diff emits the full next assignee list when changed", () => {
    expect(
      diffIssueEdit(base(), { ...base(), assigneeUsernames: ["ada", "bob"] }),
    ).toEqual({ assignees: ["ada", "bob"] });
  });

  it("diff emits both update and assignees when both change", () => {
    expect(
      diffIssueEdit(base(), {
        ...base(),
        title: "New",
        assigneeUsernames: ["bob"],
      }),
    ).toEqual({ update: { title: "New" }, assignees: ["bob"] });
  });
});

import { tool, type Tool } from "@lmstudio/sdk";
import { z } from "zod";
import { nowIso, readJson, writeJson } from "../store/jsonStore";

type Todo = { id: string; text: string; done: boolean; created_at: string };

const MAX_TODOS = 200;

function loadTodos(): Todo[] {
  const data = readJson<Todo[]>("todos.json", []);
  return Array.isArray(data) ? data : [];
}

function saveTodos(todos: Todo[]): void {
  writeJson("todos.json", todos.slice(0, MAX_TODOS));
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todoTools(): Tool[] {
  const readTodos = tool({
    name: "read_todos",
    description: "List local todos stored on this machine.",
    parameters: {},
    implementation: async () => loadTodos(),
  });

  const addTodo = tool({
    name: "add_todo",
    description: "Add a todo item.",
    parameters: { text: z.string() },
    implementation: async ({ text }) => {
      const value = text.trim().slice(0, 500);
      if (!value) return "Error: text is required";
      const todos = loadTodos();
      if (todos.length >= MAX_TODOS) return `Error: max ${MAX_TODOS} todos`;
      const item = { id: newId(), text: value, done: false, created_at: nowIso() };
      todos.push(item);
      saveTodos(todos);
      return item;
    },
  });

  const completeTodo = tool({
    name: "complete_todo",
    description: "Mark a todo complete by id or matching text.",
    parameters: { todo_or_id: z.string() },
    implementation: async ({ todo_or_id }) => {
      const needle = todo_or_id.trim().toLowerCase();
      const todos = loadTodos();
      let n = 0;
      for (const todo of todos) {
        if (todo.id.toLowerCase() === needle || todo.text.toLowerCase().includes(needle)) {
          todo.done = true;
          n += 1;
        }
      }
      saveTodos(todos);
      return { ok: true, completed: n };
    },
  });

  const removeTodo = tool({
    name: "remove_todo",
    description: "Remove a todo by id or matching text.",
    parameters: { todo_or_id: z.string() },
    implementation: async ({ todo_or_id }) => {
      const needle = todo_or_id.trim().toLowerCase();
      const todos = loadTodos();
      const kept = todos.filter(
        (t) => t.id.toLowerCase() !== needle && !t.text.toLowerCase().includes(needle),
      );
      saveTodos(kept);
      return { ok: true, removed: todos.length - kept.length };
    },
  });

  return [readTodos, addTodo, completeTodo, removeTodo];
}

import { Hono } from "hono"
import { serve } from "@hono/node-server"
import Database from "better-sqlite3"

const app = new Hono()

// ===== DB SETUP =====
const db = new Database("guests.db")

db.prepare(`
  CREATE TABLE IF NOT EXISTS guests (
    guestid   INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    phone     TEXT,
    email     TEXT,
    address   TEXT
  )
`).run()

// ===== Helper =====
function isPositiveInt(n: unknown) {
  return Number.isInteger(n) && (n as number) > 0
}

type GuestInput = {
  guestid?: number
  name?: string
  phone?: string
  email?: string
  address?: string
}

// ตรวจข้อมูลจาก body
function validateGuest(body: GuestInput) {
  const errors: string[] = []

  if (typeof body.name !== "string" || body.name.trim() === "") {
    errors.push("name is required (non-empty string)")
  }

  if (body.phone !== undefined && typeof body.phone !== "string") {
    errors.push("phone must be string if provided")
  }

  if (body.email !== undefined && typeof body.email !== "string") {
    errors.push("email must be string if provided")
  }

  if (body.address !== undefined && typeof body.address !== "string") {
    errors.push("address must be string if provided")
  }

  return errors
}

// ====== CRUD API ======

/**
 * GET /api/guests
 * ดึง guest ทั้งหมด
 */
app.get("/api/guests", (c) => {
  const rows = db.prepare(`SELECT * FROM guests`).all()
  return c.json(rows)
})

/**
 * GET /api/guests/:id
 * ดึง guest ตาม id
 */
app.get("/api/guests/:id", (c) => {
  const id = Number(c.req.param("id"))

  if (!isPositiveInt(id)) {
    return c.json({ message: "guestid must be positive integer" }, 400)
  }

  const row = db
    .prepare(`SELECT * FROM guests WHERE guestid = ?`)
    .get(id)

  if (!row) {
    return c.json({ message: "guest not found" }, 404)
  }

  return c.json(row)
})

/**
 * POST /api/guests
 * เพิ่ม guest ใหม่
 * body: { guestid(optional), name, phone?, email?, address? }
 */
app.post("/api/guests", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as GuestInput | null

    if (!body) {
      return c.json({ message: "invalid JSON body" }, 400)
    }

    const errors = validateGuest(body)
    if (errors.length > 0) {
      return c.json({ message: "validation error", errors }, 400)
    }

    let id = body.guestid

    // ถ้าไม่ส่ง guestid มา ให้ SQLite auto-increment เอง
    const stmt = db.prepare(`
      INSERT INTO guests (guestid, name, phone, email, address)
      VALUES (?, ?, ?, ?, ?)
    `)

    const info = stmt.run(
      id ?? null,
      body.name!.trim(),
      body.phone ?? null,
      body.email ?? null,
      body.address ?? null
    )

    // ถ้าไม่ได้ส่ง id, ใช้ lastInsertRowid แทน
    const guestid = id ?? Number(info.lastInsertRowid)

    const created = db
      .prepare(`SELECT * FROM guests WHERE guestid = ?`)
      .get(guestid)

    return c.json(created, 201)
  } catch (err: any) {
    // handle duplicate หรือ error อื่น
    return c.json(
      { message: "internal error", error: err?.message ?? String(err) },
      500
    )
  }
})

/**
 * PUT /api/guests/:id
 * แก้ไขข้อมูล guest ทั้งหมดของ id ที่ระบุ
 */
app.put("/api/guests/:id", async (c) => {
  const id = Number(c.req.param("id"))

  if (!isPositiveInt(id)) {
    return c.json({ message: "guestid must be positive integer" }, 400)
  }

  const existing = db
    .prepare(`SELECT * FROM guests WHERE guestid = ?`)
    .get(id)

  if (!existing) {
    return c.json({ message: "guest not found" }, 404)
  }

  const body = (await c.req.json().catch(() => null)) as GuestInput | null

  if (!body) {
    return c.json({ message: "invalid JSON body" }, 400)
  }

  const errors = validateGuest(body)
  if (errors.length > 0) {
    return c.json({ message: "validation error", errors }, 400)
  }

  db.prepare(
    `
      UPDATE guests
      SET name = ?, phone = ?, email = ?, address = ?
      WHERE guestid = ?
    `
  ).run(
    body.name!.trim(),
    body.phone ?? null,
    body.email ?? null,
    body.address ?? null,
    id
  )

  const updated = db
    .prepare(`SELECT * FROM guests WHERE guestid = ?`)
    .get(id)

  return c.json(updated)
})

/**
 * DELETE /api/guests/:id
 * ลบ guest
 */
app.delete("/api/guests/:id", (c) => {
  const id = Number(c.req.param("id"))

  if (!isPositiveInt(id)) {
    return c.json({ message: "guestid must be positive integer" }, 400)
  }

  const info = db
    .prepare(`DELETE FROM guests WHERE guestid = ?`)
    .run(id)

  if (info.changes === 0) {
    return c.json({ message: "guest not found" }, 404)
  }

  return c.json({ message: "deleted" })
})

// ===== Start Server =====
const port = 3000
console.log(`Guest API running at http://localhost:${port}`)
serve({
  fetch: app.fetch,
  port,
})

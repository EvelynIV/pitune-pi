import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const execFileAsync = promisify(execFile)

let serialStream: ReturnType<typeof createWriteStream> | null = null
let serialPath = ''
let serialBaudRate = 0

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readRequestBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []

    req.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function closeSerial() {
  if (!serialStream) {
    return
  }

  const stream = serialStream
  serialStream = null

  await new Promise<void>((resolve, reject) => {
    stream.end((error?: Error | null) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

function serialApiPlugin(): Plugin {
  return {
    name: 'pitune-serial-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/serial')) {
          next()
          return
        }

        try {
          if (req.method === 'GET' && req.url === '/api/serial/status') {
            sendJson(res, 200, {
              connected: Boolean(serialStream),
              path: serialPath,
              baudRate: serialBaudRate,
            })
            return
          }

          if (req.method === 'POST' && req.url === '/api/serial/connect') {
            const body = JSON.parse(await readRequestBody(req)) as {
              baudRate?: number
              path?: string
            }
            const path = body.path?.trim() || '/dev/ttyUSB0'
            const baudRate = Number(body.baudRate) || 115200

            await closeSerial()
            await execFileAsync('stty', [
              '-F',
              path,
              String(baudRate),
              'cs8',
              '-cstopb',
              '-parenb',
              '-ixon',
              '-ixoff',
              'raw',
              '-echo',
              'min',
              '0',
              'time',
              '1',
            ])

            serialStream = createWriteStream(path, { flags: 'a' })
            serialPath = path
            serialBaudRate = baudRate
            sendJson(res, 200, { connected: true, path, baudRate })
            return
          }

          if (req.method === 'POST' && req.url === '/api/serial/disconnect') {
            await closeSerial()
            sendJson(res, 200, { connected: false })
            return
          }

          if (req.method === 'POST' && req.url === '/api/serial/send') {
            const body = JSON.parse(await readRequestBody(req)) as { command?: string }

            if (!serialStream) {
              sendJson(res, 409, { error: 'serial not connected' })
              return
            }

            const command = `${body.command ?? ''}\n`
            await new Promise<void>((resolve, reject) => {
              serialStream?.write(command, 'utf8', (error) => {
                if (error) {
                  reject(error)
                } else {
                  resolve()
                }
              })
            })
            sendJson(res, 200, { sent: true })
            return
          }

          sendJson(res, 404, { error: 'not found' })
        } catch (error) {
          sendJson(res, 500, {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    serialApiPlugin(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})

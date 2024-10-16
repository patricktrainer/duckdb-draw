import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm_next from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm';



const DUCKDB_BUNDLES = {
  eh: {
    mainModule: duckdb_wasm_next,
    mainWorker: new URL('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js', import.meta.url).toString(),
  },
};

const PixelArtEditor = () => {
  const [db, setDb] = useState(null);
  const [canvasSize] = useState({ width: 16, height: 16 });
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [pixels, setPixels] = useState([]);
  const canvasRef = useRef(null);

  const initializeCanvas = useCallback(async (database) => {
    try {
      console.log('Initializing canvas...');
      const conn = await database.connect();
      await conn.query(`
        CREATE TABLE IF NOT EXISTS pixels (
          x INTEGER,
          y INTEGER,
          color VARCHAR(7),
          PRIMARY KEY (x, y)
        )
      `);
      await conn.query(`
        WITH RECURSIVE
        x(i) AS (
            SELECT 0
            UNION ALL
            SELECT i+1 FROM x WHERE i < ${canvasSize.width - 1}
        ),
        y(j) AS (
            SELECT 0
            UNION ALL
            SELECT j+1 FROM y WHERE j < ${canvasSize.height - 1}
        )
        INSERT INTO pixels (x, y, color)
        SELECT i, j, '#FFFFFF'
        FROM x, y
        ON CONFLICT DO NOTHING
      `);
      console.log('Canvas initialized successfully');
    } catch (error) {
      console.error('Error initializing canvas:', error);
    }
  }, [canvasSize]);

  const renderCanvas = useCallback(async (database) => {
    try {
      if (database) {
        const conn = await database.connect();
        console.log('Querying pixels...');
        const result = await conn.query(`
          SELECT x, y, color
          FROM pixels
          ORDER BY y, x
        `);
        const fetchedPixels = result.toArray();
        console.log(`Fetched ${fetchedPixels.length} pixels:`);
        // log the sql text
        if (fetchedPixels.length === 0) {
          console.log('No pixels found. Reinitializing canvas...');
          await initializeCanvas(database);
          console.log('Retrying pixel query...');
          const retryResult = await conn.query(`
            SELECT x, y, color
            FROM pixels
            ORDER BY y, x
          `);
          const retryPixels = retryResult.toArray();
          console.log(`Retry fetched ${retryPixels.length} pixels:`, retryPixels);
          setPixels(retryPixels);
        } else {
          setPixels(fetchedPixels);
        }
      } else {
        console.error('Database connection is not established.');
      }
    } catch (error) {
      console.error('Error rendering canvas:', error);
    }
  }, [initializeCanvas]);

  useEffect(() => {
    async function initDB() {
      try {
        console.log('Initializing DuckDB...');
        const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
        const worker = new Worker(bundle.mainWorker);
        const logger = new duckdb.ConsoleLogger();
        const db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        await initializeCanvas(db);
        setDb(db);
        console.log('DuckDB initialized successfully');
        renderCanvas(db);
      } catch (error) {
        console.error('Error initializing DuckDB:', error);
      }
    }
    initDB();
  }, [initializeCanvas, renderCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && pixels.length > 0) {
      const ctx = canvas.getContext('2d');
      const pixelSize = canvas.width / canvasSize.width;

      pixels.forEach(pixel => {
        ctx.fillStyle = pixel.color;
        ctx.fillRect(pixel.x * pixelSize, pixel.y * pixelSize, pixelSize, pixelSize);
      });
    }
  }, [pixels, canvasSize]);

  const drawPixel = async (x, y) => {
    try {
      if (db) {
        const conn = await db.connect();
        console.log('Drawing pixel at:', { x, y, color: selectedColor });
        const stmt = await conn.prepare(`
          UPDATE pixels
          SET color = ?
          WHERE x = ? AND y = ?
        `);
        await stmt.query(selectedColor, x, y);
        // await stmt.finalize();
        renderCanvas(db);
      } else {
        console.error('Database connection is not established.');
      }
    } catch (error) {
      console.error('Error drawing pixel:', error);
    }
  };
  

  const handleCanvasClick = (e) => {
    const rect = e.target.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / (rect.width / canvasSize.width));
    const y = Math.floor((e.clientY - rect.top) / (rect.height / canvasSize.height));
    drawPixel(x, y);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={canvasSize.width * 20}
        height={canvasSize.height * 20}
        onClick={handleCanvasClick}
        style={{ border: '1px solid black' }}
      />
      <div>
        <input
          type="color"
          value={selectedColor}
          onChange={(e) => setSelectedColor(e.target.value)}
        />
      </div>
    </div>
  );
};

export default PixelArtEditor;
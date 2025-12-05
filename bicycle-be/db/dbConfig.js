import mysql from 'mysql2/promise';

// Platform detection and default configs
// macOS MAMP: port 8889, password 'root'
// Windows XAMPP: port 3306, password '' (empty)
// Linux/Other: port 3306, password '' (empty)

const isMacOS = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

// Get platform-appropriate default config
const getDefaultConfig = () => {
  // If environment variables are explicitly set, use those
  if (process.env.DB_PORT || process.env.DB_PASSWORD !== undefined) {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
      database: process.env.DB_NAME || 'bicycle_data',
    };
  }
  
  // Platform-specific defaults
  if (isMacOS) {
    // macOS: Default to MAMP (port 8889, password 'root')
    return {
      host: 'localhost',
      port: 8889,
      user: 'root',
      password: 'root',
      database: process.env.DB_NAME || 'bicycle_data',
    };
  } else if (isWindows) {
    // Windows: Default to XAMPP (port 3306, empty password)
    return {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: process.env.DB_NAME || 'bicycle_data',
    };
  } else {
    // Linux/Other: Standard MySQL
    return {
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: process.env.DB_NAME || 'bicycle_data',
    };
  }
};

// Get all configs to try (for auto-detection)
const getAllConfigsToTry = () => {
  const configs = [];
  
  // If env vars are set, only try those
  if (process.env.DB_PORT || process.env.DB_PASSWORD !== undefined) {
    return [getDefaultConfig()];
  }
  
  // macOS: Try MAMP first, then standard
  if (isMacOS) {
    configs.push({
      host: 'localhost',
      port: 8889,
      user: 'root',
      password: 'root',
      database: process.env.DB_NAME || 'bicycle_data',
    });
    configs.push({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: process.env.DB_NAME || 'bicycle_data',
    });
  }
  // Windows: Try XAMPP first, then MAMP-style as fallback
  else if (isWindows) {
    configs.push({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: process.env.DB_NAME || 'bicycle_data',
    });
    configs.push({
      host: 'localhost',
      port: 8889,
      user: 'root',
      password: 'root',
      database: process.env.DB_NAME || 'bicycle_data',
    });
  }
  // Linux/Other: Standard MySQL
  else {
    configs.push({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      database: process.env.DB_NAME || 'bicycle_data',
    });
  }
  
  return configs;
};

// Get the default config for this platform
const defaultConfig = getDefaultConfig();

// Create dbConfig with pool settings
let dbConfig = {
  ...defaultConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// If DB_SOCKET_PATH is set, use socket connection instead of TCP
if (process.env.DB_SOCKET_PATH) {
  dbConfig.socketPath = process.env.DB_SOCKET_PATH;
  delete dbConfig.host;
  delete dbConfig.port;
}

// Log initial config
console.log('🔌 MySQL Connection Config:');
if (dbConfig.socketPath) {
  console.log('   Connection: Unix Socket');
  console.log('   Socket Path:', dbConfig.socketPath);
} else {
  console.log('   Host:', dbConfig.host);
  console.log('   Port:', dbConfig.port);
}
console.log('   User:', dbConfig.user);
console.log('   Database:', dbConfig.database);
console.log('   Password:', dbConfig.password ? '***set***' : '(empty)');
const configName = defaultConfig.port === 8889 ? 'MAMP' : 'XAMPP/Standard';
console.log('   Platform:', isMacOS ? 'macOS' : (isWindows ? 'Windows' : 'Linux/Other'));
console.log('   Default:', configName);
console.log('');

// Create connection pool immediately with platform defaults
const pool = mysql.createPool(dbConfig);

// Test connection asynchronously (non-blocking)
(async () => {
  try {
    const connection = await pool.getConnection();
    await connection.execute('SELECT 1 as test');
    connection.release();
    console.log('✅ MySQL Connection Pool Established');
    console.log('✅ Database connection verified\n');
  } catch (err) {
    // If default config failed, try auto-detection
    if (!process.env.DB_PORT && process.env.DB_PASSWORD === undefined) {
      console.error('❌ Default config failed. Trying auto-detection...\n');
      
      const configsToTry = getAllConfigsToTry();
      let workingConfig = null;
      
      for (let i = 0; i < configsToTry.length; i++) {
        const config = configsToTry[i];
        const configName = config.port === 8889 ? 'MAMP' : 'XAMPP/Standard';
        
        // Skip if it's the same as default (already tried)
        if (config.port === defaultConfig.port && config.password === defaultConfig.password) {
          continue;
        }
        
        console.log(`   Trying alternative config (${configName}):`);
        console.log(`      Port: ${config.port}, Password: ${config.password ? '***set***' : '(empty)'}`);
        
        try {
          const testConnection = await mysql.createConnection(config);
          await testConnection.execute('SELECT 1 as test');
          await testConnection.end();
          
          workingConfig = config;
          console.log(`   ✅ Found working config: ${configName}\n`);
          console.error('⚠️  WARNING: Your MySQL is using different settings than platform defaults.');
          console.error('   Consider setting environment variables:');
          console.error(`   DB_PORT=${config.port}`);
          if (config.password) {
            console.error(`   DB_PASSWORD=${config.password}`);
          }
          console.error('');
          break;
        } catch (testErr) {
          console.log(`   ❌ Failed: ${testErr.code || testErr.message}\n`);
        }
      }
      
      if (!workingConfig) {
        console.error('\n❌ All connection attempts failed. Please check:');
        console.error('   1. MySQL is running');
        console.error('   2. Connection settings');
        if (isMacOS) {
          console.error('   3. On macOS with MAMP: ensure MySQL is started in MAMP');
          console.error('      MAMP defaults: port 8889, password "root"');
        } else if (isWindows) {
          console.error('   3. On Windows with XAMPP: ensure MySQL is started in XAMPP Control Panel');
          console.error('      XAMPP defaults: port 3306, password "" (empty)');
        }
        console.error('\n⚠️  Server will continue, but database operations will fail until MySQL is running.\n');
      }
    } else {
      console.error('❌ Error establishing MySQL connection:');
      console.error('   Error Code:', err.code);
      console.error('   Error Message:', err.message);
      console.error('\n⚠️  Server will continue, but database operations will fail until MySQL is running.\n');
    }
  }
})();

// Export pool
export { pool };

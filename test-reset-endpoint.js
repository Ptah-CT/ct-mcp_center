#!/usr/bin/env node

/**
 * Test script for the new resetErrorStatus tRPC endpoint
 * 
 * NOTE: This endpoint requires authentication via better-auth session cookies.
 * For production use, ensure the user is logged in before making these calls.
 */

const BACKEND_URL = 'http://localhost:32009';

async function testResetEndpoint() {
  console.log('🜄 Testing resetErrorStatus tRPC endpoint...');

  try {
    // First, let's list all servers to find one in ERROR state
    console.log('\n1. Listing all MCP servers to find ones in ERROR state...');

    const listResponse = await fetch(`${BACKEND_URL}/trpc/frontend.mcpServers.list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!listResponse.ok) {
      console.error('❌ Failed to list servers:', listResponse.status, await listResponse.text());
      return;
    }

    const listData = await listResponse.json();
    console.log('📋 Server list response status:', listData.result?.data?.success);

    if (!listData.result?.data?.success) {
      console.error('❌ Server list request failed:', listData.result?.data?.message);
      return;
    }

    const servers = listData.result.data.data || [];
    console.log(`📊 Found ${servers.length} total servers`);

    // Find servers in ERROR state
    const errorServers = servers.filter(server => server.error_status === 'ERROR');
    console.log(`🔥 Found ${errorServers.length} servers in ERROR state`);

    if (errorServers.length === 0) {
      console.log('ℹ️ No servers in ERROR state found. Cannot test reset functionality.');
      return;
    }

    const testServer = errorServers[0];
    console.log(`🎯 Testing with server: ${testServer.name} (${testServer.uuid})`);

    // Now test the resetErrorStatus endpoint
    console.log('\n2. Testing resetErrorStatus endpoint...');

    const resetResponse = await fetch(`${BACKEND_URL}/trpc/frontend.mcpServers.resetErrorStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uuid: testServer.uuid
      }),
    });

    console.log('📡 Reset response status:', resetResponse.status);
    const resetData = await resetResponse.json();

    if (!resetResponse.ok) {
      console.error('❌ Reset request failed with HTTP status:', resetResponse.status);
      console.error('❌ Response:', resetData);
      return;
    }

    console.log('✅ Reset response received:', {
      success: resetData.result?.data?.success,
      message: resetData.result?.data?.message,
      hasData: !!resetData.result?.data?.data
    });

    if (resetData.result?.data?.success) {
      console.log('🎉 Reset operation successful!');
      console.log('📄 Updated server data:', resetData.result.data.data ? {
        name: resetData.result.data.data.name,
        error_status: resetData.result.data.data.error_status
      } : 'No data returned');
    } else {
      console.log('⚠️ Reset operation failed:', resetData.result?.data?.message);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testResetEndpoint().catch(console.error);
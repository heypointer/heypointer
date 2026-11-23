// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
package com.heypointer.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ClientIdTest {
    private val id = "hpc_0123456789abcdef01234567"

    @Test fun headerName() = assertEquals("X-HeyPointer-Client", ClientId.HEADER)

    @Test fun wellFormedIdMaySend() = assertNull(ClientId.localProblem(id))

    @Test fun idsIssuedBeforeTheHpPrefixesStayValid() {
        assertNull(ClientId.localProblem("gfc_0123456789abcdef01234567"))
        assertNull(ClientId.localProblem("gfc_ea6fae0123456789abcdef01"))
        assertNotNull(ClientId.localProblem("gfx_0123456789abcdef01234567"))
    }

    @Test fun blankIdIsSentWithoutTheHeaderSoTheServerDecides() {
        assertNull(ClientId.localProblem(""))
        assertNull(ClientId.localProblem("   "))
    }

    @Test fun malformedIdsNeverReachTheServer() {
        for (bad in listOf("hpc_short", "abc", "GFC_0123456789abcdef01234567", "hpc_0123456789abcdef0123456g", "hpc_0123456789abcdef012345678")) {
            assertEquals(bad, Str.CLIENT_MALFORMED, ClientId.localProblem(bad))
        }
    }

    @Test fun missingIdFromTheServerSaysWhatToDo() {
        val msg = ClientId.failureMessage(401, """{"error":"client_required","message":"x"}""")
        assertEquals(Str.CLIENT_REQUIRED.default, msg)
        assertEquals(Str.CLIENT_REQUIRED, ClientId.failure(401, """{"error":"client_required"}""").key)
        assertTrue(msg.contains("heypointer init"))
    }

    @Test fun eachFailureHasItsOwnPlainMessage() {
        val invalid = ClientId.failureMessage(401, """{"error":"client_invalid"}""")
        val origin = ClientId.failureMessage(403, """{"error":"client_origin_not_allowed"}""")
        val rate = ClientId.failureMessage(429, """{"error":"rate_limited"}""")
        assertEquals(3, setOf(invalid, origin, rate).size)
        assertTrue(invalid.contains("does not recognise"))
        assertTrue(origin.contains("not allowed"))
        assertTrue(rate.contains("too many requests"))
        for (m in listOf(invalid, origin, rate)) assertFalse(m.contains("{"))
    }

    @Test fun otherErrorsKeepTheirCodeOrStatus() {
        assertEquals("The HeyPointer server said: bad_request", ClientId.failureMessage(400, """{"error":"bad_request"}"""))
        assertEquals("The HeyPointer server said: HTTP 502", ClientId.failureMessage(502, "<html>"))
        assertNotNull(ClientId.failureMessage(401, ""))
    }
}

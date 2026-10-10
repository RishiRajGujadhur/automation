@authentication
Feature: Authentication
  Background: Signed out
    Given the browser is started
  Scenario: Sign in
    Given the login page is open
    When the user signs in as "test-user"
    Then the dashboard is displayed

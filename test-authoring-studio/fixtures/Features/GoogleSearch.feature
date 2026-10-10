@smoke @search
Feature: Google Search
  Discover the web with reusable search capabilities.

  Background: A fresh browser
    Given the browser is started

  Scenario: Search for Dayforce
    Given the user opens Google
    When the user searches for "Dayforce.com"
    Then search results should appear

  Scenario Outline: Search multiple terms
    Given the user opens Google
    When the user searches for "<searchText>"
    Then search results should appear
    Examples:
      | searchText |
      | Playwright |
      | SpecFlow   |
